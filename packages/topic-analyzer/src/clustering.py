import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
import logging

def perform_clustering(df: pd.DataFrame) -> pd.DataFrame:
    """Run DBSCAN clustering on embedding vectors."""
    if df.empty:
        logging.warning("perform_clustering received empty DataFrame")
        df["cluster_id"] = []
        return df

    if "vector" not in df.columns:
        raise ValueError("DataFrame missing 'vector' column")

    # Normalize vectors
    vectors = []
    for idx, v in enumerate(df["vector"]):
        try:
            arr = np.asarray(v, dtype=float)
            if arr.ndim != 1:
                raise ValueError("Vector must be 1D")
            vectors.append(arr)
        except Exception as err:
            logging.error(f"Skipping row {idx} due to invalid vector: {err}")
            vectors.append(None)

    df["_vec_ok"] = [v is not None for v in vectors]
    usable_vectors = [v for v in vectors if v is not None]

    if not usable_vectors:
        logging.warning("No usable vectors for clustering.")
        df["cluster_id"] = -1
        return df

    # Validate all vectors have identical dimensions
    dims = {v.shape[0] for v in usable_vectors}
    if len(dims) != 1:
        logging.error(f"Inconsistent vector dimensions detected: {dims}")
        df["cluster_id"] = -1
        return df

    matrix = np.vstack(usable_vectors)

    # DBSCAN
    db = DBSCAN(
        eps=0.6,
        min_samples=3,
        metric="euclidean"
    )
    labels = db.fit_predict(matrix)

    # Propagate labels into original df
    label_idx = 0
    cluster_ids = []
    for ok in df["_vec_ok"]:
        if ok:
            cluster_ids.append(labels[label_idx])
            label_idx += 1
        else:
            cluster_ids.append(-1)

    df = df.drop(columns=["_vec_ok"])
    df["cluster_id"] = cluster_ids

    num_clusters = len(set(cluster_ids)) - (1 if -1 in cluster_ids else 0)
    logging.info(f"DBSCAN formed {num_clusters} clusters.")

    return df
