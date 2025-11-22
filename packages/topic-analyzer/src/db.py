import os
import logging
import pandas as pd
from azure.cosmos import CosmosClient
from datetime import datetime, timedelta
from typing import List, Dict, Any

COSMOS_CONN_STR = os.getenv("COSMOS_DB_CONNECTION")
DB_NAME = "news-embedding-cluster"
CONTAINER_ARTICLES = "articles"
CONTAINER_TOPICS = "topics"

# Reuse a single Cosmos client
_client = None

def get_client():
    global _client
    if _client is None:
        if not COSMOS_CONN_STR:
            raise RuntimeError("COSMOS_DB_CONNECTION is not set.")
        _client = CosmosClient.from_connection_string(COSMOS_CONN_STR)
    return _client

def get_container(name: str):
    client = get_client()
    db = client.get_database_client(DB_NAME)
    return db.get_container_client(name)

def fetch_daily_articles(hours: int = 24) -> pd.DataFrame:
    """Fetch metadata + vector for last N hours."""
    container = get_container(CONTAINER_ARTICLES)

    start_time = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    query = """
    SELECT c.id, c.title, c.sourceId, c.publishedAt, c.embedding AS vector, c.url
    FROM c
    WHERE c.publishedAt >= @start
    """

    try:
        items = list(container.query_items(
            query=query,
            parameters=[{"name": "@start", "value": start_time}],
            enable_cross_partition_query=True
        ))
    except Exception as e:
        logging.exception(f"Cosmos query failed: {e}")
        return pd.DataFrame()

    return pd.DataFrame(items)

def get_active_topics(days: int = 7) -> List[Dict[str, Any]]:
    """Fetch topics from the last N days that are still relevant."""
    container = get_container(CONTAINER_TOPICS)
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    query = """
    SELECT c.id, c.topicName, c.centroid, c.articleCount, c.firstSeen, 
           c.totalArticlesSeen, c.partitionKey
    FROM c
    WHERE c.date >= @start AND c.type = 'daily_topic'
    """
    
    try:
        items = list(container.query_items(
            query=query,
            parameters=[{"name": "@start", "value": start_date}],
            enable_cross_partition_query=True
        ))
        logging.info(f"Fetched {len(items)} active topics from last {days} days")
        return items
    except Exception as e:
        logging.error(f"Failed to fetch active topics: {e}")
        return []

def save_topics(topics_list: List[Dict[str, Any]]):
    container = get_container(CONTAINER_TOPICS)
    for topic in topics_list:
        try:
            container.upsert_item(topic)
        except Exception as e:
            logging.error(f"Failed to save topic {topic.get('id')}: {e}")