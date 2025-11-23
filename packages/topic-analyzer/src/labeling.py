import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

import numpy as np
import pandas as pd
from openai import OpenAI

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    logging.warning("OPENAI_API_KEY missing — topics will be unlabeled.")

client = OpenAI(api_key=API_KEY) if API_KEY else None

# ------------------------------------------------------------------------------
# Topic Matching by Vector Similarity
# ------------------------------------------------------------------------------

def find_matching_topic(
    cluster_vector: np.ndarray,
    existing_topics: List[Dict[str, Any]],
    threshold: float = 0.70
) -> Dict[str, Any] | None:
    """Match a new cluster centroid to an existing topic by cosine similarity."""
    if not existing_topics:
        return None

    cluster_norm = cluster_vector / np.linalg.norm(cluster_vector)
    best_match = None
    best_score = threshold

    for topic in existing_topics:
        centroid = topic.get("centroid")
        if centroid is None:
            continue

        topic_vec = np.asarray(centroid, dtype=float)
        topic_norm = topic_vec / np.linalg.norm(topic_vec)

        sim = float(np.dot(cluster_norm, topic_norm))
        if sim > best_score:
            best_score = sim
            best_match = topic

    return best_match


# ------------------------------------------------------------------------------
# LLM Labeling
# ------------------------------------------------------------------------------

def get_llm_label(titles: List[str]) -> str:
    """LLM short topic label (3–5 words)."""
    if not titles or client is None:
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
            max_tokens=20,
            temperature=0.3
        )
        msg = resp.choices[0].message.content
        return msg.strip().replace('"', "") if msg else "Cím nélküli téma"
        return msg.replace('"', "") if msg else "Cím nélküli téma"
    except Exception as e:
        logging.error(f"LLM label error: {e}")
        return "Cím nélküli téma"


def get_llm_category(titles: List[str]) -> str:
    """Broad reusable category (1 word, stable categories)."""
    if not titles or client is None:
        return "Egyéb"

    prompt = (
        "Adj meg egy széles magyar kategóriát (max 1 szóban). Példák: "
        "Politika, Gazdaság, Külföld, Sport, Technológia, Bűnügy, Közélet, Időjárás.\n"
        "A címek:\n" +
        "\n".join(f"- {t}" for t in titles)
    )

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=10
        )
        msg = resp.choices[0].message.content
        return msg.strip().replace('"', "") if msg else "Egyéb"
        return msg.replace('"', "") if msg else "Egyéb"
    except Exception as e:
        logging.error(f"LLM category error: {e}")
        return "Egyéb"


# ------------------------------------------------------------------------------
# Topic Label Generation
# ------------------------------------------------------------------------------

def generate_topic_labels(
    df: pd.DataFrame,
    existing_topics: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Assign new or updated topic documents to clusters."""
    topics_output = []
    today = datetime.utcnow().strftime("%Y-%m-%d")
    now = datetime.utcnow().isoformat()

    unique_clusters = sorted(df["cluster_id"].unique())

    for cluster_id in unique_clusters:
        if cluster_id == -1:
            continue

        cluster = df[df["cluster_id"] == cluster_id]

        # ----- Centroid -----
        vectors = cluster["vector"].apply(lambda v: np.asarray(v, dtype=float)).tolist()
        centroid = np.mean(vectors, axis=0)

        # ----- Try to match existing topic -----
        titles = cluster["title"].dropna().tolist()
        matched_topic = find_matching_topic(centroid, existing_topics)

        # ----- Articles with source + URL -----
        articles_list = [
            {
                "title": row["title"],
                "sourceId": row["sourceId"],
                "url": row.get("url")
            }
            for _, row in cluster.iterrows()
        ]

        # High-level source counts
        sources_count = cluster["sourceId"].value_counts().to_dict()

        # ------------------------------------------------------------------
        # Existing Topic Update
        # ------------------------------------------------------------------
        if matched_topic:
            topic_doc = {
                "id": matched_topic["id"],
                "partitionKey": matched_topic.get("firstSeen", today),
                "type": "daily_topic",
                "date": today,
                "topicName": matched_topic["topicName"],  # keep old short name
                "category": matched_topic.get("category", get_llm_category(titles)),
                "articleCount": len(cluster),
                "totalArticlesSeen": matched_topic.get("totalArticlesSeen", 0) + len(cluster),
                "sources": sources_count,
                "articles": articles_list,
                "representativeTitles": titles[:5],
                "centroid": centroid.tolist(),
                "firstSeen": matched_topic.get("firstSeen", today),
                "lastUpdated": now
            }

            logging.info(
                f"✓ Matched cluster {cluster_id} → existing topic: {matched_topic['topicName']}"
            )

        # ------------------------------------------------------------------
        # New Topic (needs LLM)
        # ------------------------------------------------------------------
        else:
            topic_name = get_llm_label(titles)
            category = get_llm_category(titles)

            topic_doc = {
                "id": f"{today}-cluster-{cluster_id}",
                "partitionKey": today,
                "type": "daily_topic",
                "date": today,
                "topicName": topic_name,          # short label
                "category": category,            # broad category
                "articleCount": len(cluster),
                "totalArticlesSeen": len(cluster),
                "sources": sources_count,
                "articles": articles_list,       # full article list
                "representativeTitles": titles[:5],
                "centroid": centroid.tolist(),
                "firstSeen": today,
                "lastUpdated": now
            }

            logging.info(f"★ New topic created: {topic_name} [{category}]")

        topics_output.append(topic_doc)

    return topics_output


# ------------------------------------------------------------------------------
# Fetching Active Topics (for reuse during matching)
# ------------------------------------------------------------------------------

def get_active_topics(container, days: int = 7) -> List[Dict[str, Any]]:
    """Fetch topics from the last N days that are still relevant."""
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

    query = """
    SELECT c.id, c.topicName, c.centroid, c.articleCount, c.firstSeen,
           c.totalArticlesSeen, c.category
    FROM c
    WHERE c.date >= @start AND c.type = 'daily_topic'
    """

    try:
        items = list(container.query_items(
            query=query,
            parameters=[{"name": "@start", "value": start_date}],
            enable_cross_partition_query=True
        ))
        logging.info(f"Fetched {len(items)} active topics")
        return items
    except Exception as e:
        logging.error(f"Failed to fetch active topics: {e}")
        return []
