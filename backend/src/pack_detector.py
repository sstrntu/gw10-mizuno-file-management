"""
Pack Detector Module
Detects which pack a filename belongs to based on keyTokens.
"""

from typing import Dict, Any, Optional, List


class PackDetectionError(Exception):
    """Base exception for pack detection errors."""
    pass


class PackNotFoundError(PackDetectionError):
    """Raised when no pack matches the filename."""
    pass


class PackAmbiguousError(PackDetectionError):
    """Raised when multiple packs match the filename."""
    pass


class PackDetector:
    def __init__(self, packs: List[Dict[str, Any]]):
        """
        Initialize the pack detector.
        
        Args:
            packs: List of pack configurations from config
        """
        self.packs = packs
    
    def detect(self, filename: str) -> Dict[str, Any]:
        """
        Detect which pack the filename belongs to.
        
        A pack matches if ALL of its keyTokens appear in the filename (case-insensitive).
        
        Args:
            filename: The filename to analyze
        
        Returns:
            Dict containing pack information (id, folder, etc.)
        
        Raises:
            PackNotFoundError: If no pack matches
            PackAmbiguousError: If multiple packs match
        """
        filename_lower = filename.lower()
        matched_packs = []
        
        for pack in self.packs:
            key_tokens = pack.get("keyTokens", [])
            
            # Check if ALL keyTokens appear in the filename
            all_tokens_match = all(
                token.lower() in filename_lower 
                for token in key_tokens
            )
            
            if all_tokens_match:
                matched_packs.append(pack)
        
        # Handle results
        if len(matched_packs) == 0:
            raise PackNotFoundError(
                f"No pack found for filename: {filename}. "
                f"Filename must contain all keyTokens from at least one pack."
            )
        
        if len(matched_packs) > 1:
            pack_names = [p.get("folder", p.get("id")) for p in matched_packs]
            raise PackAmbiguousError(
                f"Multiple packs match filename: {filename}. "
                f"Matched packs: {', '.join(pack_names)}"
            )
        
        return matched_packs[0]


def detect_pack(filename: str, packs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Convenience function to detect pack.
    
    Args:
        filename: The filename to analyze
        packs: List of pack configurations
    
    Returns:
        Dict containing pack information
    """
    detector = PackDetector(packs)
    return detector.detect(filename)
