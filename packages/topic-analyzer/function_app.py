import logging
import azure.functions as func

from src.db import fetch_daily_articles, save_topics, get_active_topics
from src.clustering import perform_clustering
from src.labeling import generate_topic_labels

app = func.FunctionApp()

@app.schedule(
    schedule="1 0,15,30,45 * * * *",
    arg_name="myTimer",
    run_on_startup=True,
    use_monitor=False
)
def topic_analyzer_timer(myTimer: func.TimerRequest) -> None:
    if myTimer.past_due:
        logging.warning("Timer is past due!")

    logging.info("--- Topic Analyzer Started ---")

    try:
        # --- FETCH ARTICLES ---
        articles_df = fetch_daily_articles(hours=24)

        if articles_df.empty:
            logging.info("No articles found in last 24h — skipping clustering.")
            return

        logging.info(f"Loaded {len(articles_df)} articles.")

        # --- FETCH EXISTING TOPICS (last 7 days) ---
        existing_topics = get_active_topics(days=7)
        logging.info(f"Found {len(existing_topics)} existing topics to check against.")

        # --- CLUSTER ---
        clustered_df = perform_clustering(articles_df)

        # --- LABEL (Smart - matches existing topics first) ---
        topics_list = generate_topic_labels(clustered_df, existing_topics)

        # --- SAVE ---
        if topics_list:
            save_topics(topics_list)
            logging.info(f"Saved {len(topics_list)} topics.")
            
            # Log summary
            new_count = sum(1 for t in topics_list if t.get('totalArticlesSeen') == t.get('articleCount'))
            updated_count = len(topics_list) - new_count
            logging.info(f"  → {new_count} new topics, {updated_count} updated topics")

    except Exception as e:
        logging.exception(f"Fatal Error in Topic Analyzer: {e}")
        raise

    logging.info("--- Topic Analyzer Finished ---")