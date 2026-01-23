"""
Model Detector Module
Detects model codes in filenames using substring matching.
"""

from typing import Dict, Any, Optional, List


class ModelDetector:
    def __init__(self, models: List[Dict[str, Any]]):
        """
        Initialize the model detector.
        
        Args:
            models: List of model configurations from config
        """
        self.models = models
    
    def detect(self, filename: str) -> Optional[Dict[str, Any]]:
        """
        Detect model code in the filename.

        Model codes are matched anywhere in the filename (substring match).
        Longer/more specific codes are checked first to avoid substring conflicts
        (e.g., A3E_HI before A3E).

        Args:
            filename: The filename to analyze

        Returns:
            Dict containing model information (code, folder) or None if no model found
        """
        filename_upper = filename.upper()

        # Sort models by code length (descending) to check longer/more specific codes first
        sorted_models = sorted(self.models, key=lambda m: len(m.get("code", "")), reverse=True)

        for model in sorted_models:
            code = model.get("code", "")
            code_upper = code.upper()

            # Check if model code appears anywhere in filename
            if code_upper in filename_upper:
                return {
                    "code": code,
                    "folder": model.get("folder", "")
                }

        return None


def detect_model(filename: str, models: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Convenience function to detect model code.
    
    Args:
        filename: The filename to analyze
        models: List of model configurations
    
    Returns:
        Dict containing model information or None
    """
    detector = ModelDetector(models)
    return detector.detect(filename)
