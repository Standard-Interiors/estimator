import os
import sys
import subprocess

def convert_heic_to_jpg(heic_path, jpg_path=None):
    """
    Convert a HEIC file to JPG format using macOS sips tool
    
    Args:
        heic_path: Path to the HEIC file
        jpg_path: Optional output JPG path (if not provided, uses the same name with .jpg extension)
    
    Returns:
        Path to the converted JPG file
    """
    if jpg_path is None:
        jpg_path = os.path.splitext(heic_path)[0] + '.jpg'
    
    # Use macOS sips command to convert
    try:
        subprocess.run([
            'sips',
            '-s', 'format', 'jpeg',
            '-s', 'formatOptions', 'normal',
            '--out', jpg_path,
            heic_path
        ], check=True, capture_output=True)
        print(f"Converted {heic_path} to {jpg_path}")
        return jpg_path
    except subprocess.CalledProcessError as e:
        print(f"Error converting file: {e}")
        print(f"Error details: {e.stderr.decode() if e.stderr else 'No error details'}")
        return None

if __name__ == "__main__":
    # Hardcoded path to the HEIC file
    heic_path = "/Users/william/fashion/src/IMG_5646.HEIC"
    jpg_path = os.path.splitext(heic_path)[0] + '.jpg'
    
    convert_heic_to_jpg(heic_path, jpg_path)
