#!/usr/bin/env python3
"""
CLI Interface for Filename Resolver
Usage: python cli.py "filename.jpg"
"""

import sys
import os
from pathlib import Path

# Add parent directory to path to import src modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.resolver import resolve_filename


def print_result(result):
    """Print the resolution result in a user-friendly format."""
    
    print(f"\nFilename: {result.filename}")
    print("=" * 60)
    
    if result.success:
        # Print pack info
        print(f"\n✓ Pack Detected: {result.pack_info.get('folder')}")
        
        # Print model info if present
        if result.model_info:
            print(f"✓ Model Detected: {result.model_info.get('code')} - {result.model_info.get('folder')}")
        else:
            print("○ Model: None (not required)")
        
        # Print matched rule
        print(f"✓ Matched Rule: {result.rule_info.get('id')} - {result.rule_info.get('description')}")
        
        # Print resolved path
        print(f"\n{'─' * 60}")
        print("Resolved Path:")
        print(f"{'─' * 60}")
        print(result.path_info.get('tree'))
        print(f"{'─' * 60}")
        print(f"\nFull Path: {result.path_info.get('full_path')}")
        
    else:
        # Print error
        print(f"\n✗ Error ({result.error_type}):")
        print(f"  {result.error}")
    
    print()


def main():
    """Main CLI entry point."""
    
    if len(sys.argv) < 2:
        print("Usage: python cli.py \"filename.jpg\"")
        print("\nExample:")
        print('  python cli.py "26SS_FTW_Bright_Gold_KV_M2J_16x9_Clean.jpg"')
        sys.exit(1)
    
    filename = sys.argv[1]
    
    # Resolve the filename
    result = resolve_filename(filename)
    
    # Print the result
    print_result(result)
    
    # Exit with appropriate code
    sys.exit(0 if result.success else 1)


if __name__ == "__main__":
    main()
