"""
Classification model for macro regime prediction.

Retrains a LogisticRegression from scratch at each backtest step.
"""

import os
import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from config import Config


class RegimeClassifier:
    """Wraps a scikit-learn LogisticRegression for binary regime classification."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.scaler = StandardScaler()
        self.classifier = LogisticRegression(
            C=cfg.regularization_C,
            class_weight=cfg.class_weight,
            max_iter=cfg.max_iter,
            solver="lbfgs",
            random_state=42,
        )
        self.feature_names: list = []
        self._is_fitted = False

    def fit(self, X: pd.DataFrame, y: pd.Series,
            sample_weight: np.ndarray = None):
        """Full train on feature matrix X and labels y."""
        self.feature_names = list(X.columns)
        X_scaled = self.scaler.fit_transform(X.values)
        self.classifier.fit(X_scaled, y.values, sample_weight=sample_weight)
        self._is_fitted = True
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        X_scaled = self.scaler.transform(X.values)
        return self.classifier.predict(X_scaled)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Predict class probabilities. Shape: (n_samples, 2)."""
        X_scaled = self.scaler.transform(X.values)
        return self.classifier.predict_proba(X_scaled)

    def get_coefficients(self) -> pd.DataFrame:
        """Extract model coefficients. Rows = classes, columns = features."""
        coefs = self.classifier.coef_
        class_names = [self.cfg.class_labels[i] for i in range(coefs.shape[0])]
        return pd.DataFrame(coefs, index=class_names, columns=self.feature_names)

    @property
    def is_fitted(self) -> bool:
        return self._is_fitted

    def save_model(self, path: str = None):
        path = path or self.cfg.model_path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        joblib.dump({
            "scaler": self.scaler,
            "classifier": self.classifier,
            "feature_names": self.feature_names,
            "is_fitted": self._is_fitted,
        }, path)
        print(f"  Model saved to {path}")

    def load_model(self, path: str = None):
        path = path or self.cfg.model_path
        data = joblib.load(path)
        self.scaler = data["scaler"]
        self.classifier = data["classifier"]
        self.feature_names = data["feature_names"]
        self._is_fitted = data["is_fitted"]
        print(f"  Model loaded from {path}")
        return self
