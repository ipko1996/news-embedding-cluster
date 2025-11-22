import pandas as pd
import numpy as np
import os
from openai import OpenAI
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    logging.warning("OPENAI_API_KEY missing — topics will be unlabeled.")

client = OpenAI(api_key=API_KEY) if API_KEY else None

def find_matching_topic(cluster_vector, existing_topics, threshold=0.7):
    """
    Find if a new cluster matches an existing topic by comparing centroids.
    
    Args:
        cluster_vector: Mean embedding of the new cluster
        existing_topics: List of existing topic documents with 'centroid'
        threshold: Cosine similarity threshold (0.7 = fairly similar)
    
    Returns:
        Matching topic ID or None
    """
    if not existing_topics:
        return None
    
    cluster_norm = cluster_vector / np.linalg.norm(cluster_vector)
    
    best_match = None
    best_similarity = threshold
    
    for topic in existing_topics:
        if 'centroid' not in topic:
            continue
            
        topic_vector = np.array(topic['centroid'])
        topic_norm = topic_vector / np.linalg.norm(topic_vector)
        
        similarity = np.dot(cluster_norm, topic_norm)
        
        if similarity > best_similarity:
            best_similarity = similarity
            best_match = topic
    
    return best_match


def generate_topic_labels(df: pd.DataFrame, existing_topics: List[Dict[str, Any]]):
    """
    Generate topic labels intelligently:
    - Match new clusters to existing topics (no GPT call)
    - Only call GPT for genuinely new topics
    - Update existing topics with new article counts
    """
    topics_output = []
    today = datetime.utcnow().strftime("%Y-%m-%d")
    now = datetime.utcnow().isoformat()

    for cluster_id in sorted(df["cluster_id"].unique()):
        if cluster_id == -1:
            continue

        cluster = df[df["cluster_id"] == cluster_id]
        
        # Calculate cluster centroid (mean of all embeddings)
        vectors = cluster["vector"].apply(lambda x: np.array(x)).tolist()
        centroid = np.mean(vectors, axis=0)
        
        # Try to match with existing topic
        matched_topic = find_matching_topic(centroid, existing_topics)
        
        titles = cluster["title"].dropna().head(5).tolist()
        sources = cluster["sourceId"].value_counts().to_dict()
        
        if matched_topic:
            # EXISTING TOPIC - Update it
            topic_doc = {
                "id": matched_topic['id'],  # Keep same ID
                "partitionKey": matched_topic.get('firstSeen', today)[:10],
                "type": "daily_topic",
                "date": today,  # Update to today
                "topicName": matched_topic['topicName'],  # Keep existing name
                "articleCount": len(cluster),
                "totalArticlesSeen": matched_topic.get('totalArticlesSeen', 0) + len(cluster),
                "sources": sources,
                "representativeTitles": titles,
                "centroid": centroid.tolist(),
                "firstSeen": matched_topic.get('firstSeen', today),
                "lastUpdated": now
            }
            logging.info(f"✓ Matched cluster {cluster_id} to existing topic: {matched_topic['topicName']}")
            
        else:
            # NEW TOPIC - Generate label with GPT
            topic_name = get_llm_label(titles)
            
            topic_doc = {
                "id": f"{today}-cluster-{cluster_id}",
                "partitionKey": today,
                "type": "daily_topic",
                "date": today,
                "topicName": topic_name,
                "articleCount": len(cluster),
                "totalArticlesSeen": len(cluster),
                "sources": sources,
                "representativeTitles": titles,
                "centroid": centroid.tolist(),
                "firstSeen": today,
                "lastUpdated": now
            }
            logging.info(f"★ Created NEW topic: {topic_name}")

        topics_output.append(topic_doc)

    return topics_output


def get_llm_label(titles: List[str]) -> str:
    if not titles:
        return "Cím nélküli téma"

    if client is None:
        return "Cím nélküli téma"

    prompt = (
        "Adj meg egy rövid, tárgyilagos magyar témacímkét (max 5 szóban) "
        "az alábbi hírcikk-címek alapján:\n" +
        "\n".join(f"- {t}" for t in titles)
    )

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20
        )
        msg_content = resp.choices[0].message.content
        if msg_content:
            msg = msg_content.strip()
            return msg.replace('"', "") if msg else "Cím nélküli téma"
        return "Cím nélküli téma"
    except Exception as e:
        logging.error(f"LLM error: {e}")
        return "Cím nélküli téma"


def get_active_topics(container, days=7):
    """Fetch topics from the last N days that are still relevant."""
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    query = """
    SELECT c.id, c.topicName, c.centroid, c.articleCount, c.firstSeen
    FROM c
    WHERE c.date >= @start AND c.type = 'daily_topic'
    """
    
    try:
        items = list(container.query_items(
            query=query,
            parameters=[{"name": "@start", "value": start_date}],
            enable_cross_partition_query=True
        ))
        return items
    except Exception as e:
        logging.error(f"Failed to fetch active topics: {e}")
        return []


