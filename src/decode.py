# decode_fashion_video.py
import json
import base64

# Read the response file
with open('video_response.json', 'r') as f:
    response = json.load(f)

# Extract the base64 video data
video_base64 = response['response']['videos'][0]['bytesBase64Encoded']

# Decode and save as MP4
video_bytes = base64.b64decode(video_base64)

with open('fashion_video.mp4', 'wb') as f:
    f.write(video_bytes)

print("✅ Video saved as 'fashion_video.mp4'")
print("🎬 You can now open it with QuickTime or any video player!")