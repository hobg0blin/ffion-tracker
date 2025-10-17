#!/usr/bin/env python3
"""
Cat detector for Windows - uses YOLO and image description model.
Monitors webcam feed for cats, captures images, describes them, and posts to the WSL server.
"""

import cv2
import time
import requests
from datetime import datetime
from pathlib import Path
from ultralytics import YOLO
import torch
from PIL import Image
import os
import sys
from transformers import AutoModelForCausalLM, AutoTokenizer

# Configuration
CONFIDENCE_THRESHOLD = 0.5
CAT_CLASS_ID = 15  # COCO dataset class ID for 'cat'
PERSON_CLASS_ID = 0  # COCO dataset class ID for 'person'
COOLDOWN_SECONDS = 60  # Wait time between detections
SAVE_DIR = Path("./detected_cats")
# WSL server is accessible from Windows via localhost
SERVER_URL = "http://localhost:3000/ffion/status"
COOKIE_FILE = "./cookies.txt"

# States for Ffion
STATES = {
    "eating": "com.ffion.eating",
    "zoomies": "com.ffion.zoomies",
    "playing": "com.ffion.playing",
    "sleeping": "com.ffion.sleeping"
}


def list_available_cameras():
    """Scan for available cameras and return a list of working indices."""
    print("Scanning for available cameras...")
    available_cameras = []

    # Try camera indices 0-10
    for index in range(11):
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if cap.isOpened():
            # Try to read a frame to verify it actually works
            ret, frame = cap.read()
            if ret and frame is not None:
                # Get camera properties
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                available_cameras.append({
                    'index': index,
                    'width': width,
                    'height': height
                })
                print(f"  ✓ Camera {index}: {width}x{height}")
            cap.release()

    return available_cameras


def select_camera():
    """Prompt user to select a camera from available cameras."""
    cameras = list_available_cameras()

    if not cameras:
        print("\n❌ No cameras found!")
        print("Make sure your webcam is connected and not in use by another application.")
        sys.exit(1)

    if len(cameras) == 1:
        selected = cameras[0]
        print(f"\nOnly one camera found. Using Camera {selected['index']}")
        return selected['index']

    print(f"\nFound {len(cameras)} camera(s)")
    print("\nAvailable cameras:")
    for cam in cameras:
        print(f"  [{cam['index']}] Camera {cam['index']} - {cam['width']}x{cam['height']}")

    while True:
        try:
            choice = input(f"\nSelect camera index (0-{cameras[-1]['index']}): ").strip()
            camera_index = int(choice)

            # Check if the selected index is in our available cameras
            if any(cam['index'] == camera_index for cam in cameras):
                print(f"✓ Selected Camera {camera_index}")
                return camera_index
            else:
                print(f"❌ Camera {camera_index} is not available. Please choose from the list above.")
        except ValueError:
            print("❌ Please enter a valid number.")
        except KeyboardInterrupt:
            print("\n\nCancelled by user.")
            sys.exit(0)


class CatDetector:
    def __init__(self, webcam_index=0):
        """Initialize the cat detector with YOLO and vision models."""
        self.webcam_index = webcam_index

        print("Loading YOLO model...")
        self.yolo_model = YOLO('yolov8n.pt')  # Using YOLOv8 nano for speed
        print("YOLO model loaded!")

        print("Loading Moondream vision model...")
        model_id = "vikhyatk/moondream2"
        revision = "2025-01-09"  # Updated to latest stable revision
        self.vision_model = AutoModelForCausalLM.from_pretrained(
            model_id,
            revision=revision,
            trust_remote_code=True,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map={"": "cuda" if torch.cuda.is_available() else "cpu"},
            attn_implementation="eager"  # Add this for compatibility
        )
        self.vision_tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
        print(f"Vision model loaded! (Using {'GPU' if torch.cuda.is_available() else 'CPU'})")

        # Create save directory
        SAVE_DIR.mkdir(exist_ok=True)

        # Load session cookie
        self.session_cookie = self._load_cookie()

        # Track last detection time
        self.last_detection_time = 0

    def _load_cookie(self):
        """Load session cookie from cookies.txt file."""
        if not Path(COOKIE_FILE).exists():
            print(f"Warning: {COOKIE_FILE} not found. You'll need to authenticate first.")
            print("From WSL, visit http://127.0.0.1:3000/get-cookie to get your session cookie.")
            print("Or from Windows browser, visit http://localhost:3000/get-cookie")
            return None

        try:
            with open(COOKIE_FILE, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        parts = line.split('\t')
                        if len(parts) >= 7 and parts[5] == 'ffion_sid':
                            return parts[6]
            print(f"Warning: Could not find ffion_sid cookie in {COOKIE_FILE}")
            return None
        except Exception as e:
            print(f"Error reading cookie file: {e}")
            return None

    def detect_cat(self, frame):
        """Detect if a cat is present in the frame. Also checks for person detection for privacy."""
        results = self.yolo_model(frame, verbose=False)

        cat_detected = False
        cat_confidence = 0.0
        person_detected = False

        for result in results:
            boxes = result.boxes
            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])

                if class_id == CAT_CLASS_ID and confidence >= CONFIDENCE_THRESHOLD:
                    cat_detected = True
                    cat_confidence = max(cat_confidence, confidence)

                if class_id == PERSON_CLASS_ID and confidence >= CONFIDENCE_THRESHOLD:
                    person_detected = True

        return cat_detected, cat_confidence, person_detected

    def describe_image(self, image_path):
        """Use Moondream vision model to describe the image."""
        try:
            # Load image
            image = Image.open(image_path)

            # Encode image
            enc_image = self.vision_model.encode_image(image)

            # Generate description with a cat-focused prompt
            prompt = "Describe what this cat is doing in one short sentence."
            description = self.vision_model.answer_question(
                enc_image,
                prompt,
                self.vision_tokenizer
            )

            # Clean up the description
            description = description.strip()

            # Ensure it's not too long
            if len(description) > 100:
                description = description[:97] + "..."

            return description

        except Exception as e:
            print(f"Error generating image description: {e}")
            # Fallback to simple description
            return "A cat has been spotted"

    def check_person_in_description(self, description):
        """Check if the description mentions a person (privacy filter)."""
        description_lower = description.lower()
        person_words = ['person', 'people', 'human', 'man', 'woman', 'someone', 'individual',
                        'owner', 'lady', 'gentleman', 'boy', 'girl', 'child', 'adult']
        return any(word in description_lower for word in person_words)

    def determine_state(self, description):
        """Determine the cat's state based on the description."""
        description_lower = description.lower()

        if any(word in description_lower for word in ['eat', 'food', 'dinner', 'breakfast', 'treats']):
            return STATES["eating"]
        elif any(word in description_lower for word in ['play', 'energy', 'hunt']):
            return STATES["playing"]
        elif any(word in description_lower for word in ['sleep', 'nap', 'rest', 'yawn']):
            return STATES["sleeping"]
        elif any(word in description_lower for word in ['zoom', 'mischief', 'midnight']):
            return STATES["zoomies"]
        else:
            return STATES["playing"]  # Default state

    def post_to_server(self, image_path, description, state):
        """Post the image and description to the server."""
        if not self.session_cookie:
            print("Error: No session cookie available. Cannot post to server.")
            return False

        try:
            with open(image_path, 'rb') as img_file:
                files = {'image': (image_path.name, img_file, 'image/jpeg')}
                data = {
                    'state': state,
                    'text': description
                }
                cookies = {'ffion_sid': self.session_cookie}

                print(f"Posting to {SERVER_URL}...")
                response = requests.post(
                    SERVER_URL,
                    files=files,
                    data=data,
                    cookies=cookies,
                    timeout=10
                )

                if response.status_code == 200:
                    result = response.json()
                    print(f"✓ Posted to server! URI: {result.get('uri', 'N/A')}")
                    return True
                else:
                    print(f"Error posting to server: {response.status_code}")
                    print(f"Response: {response.text}")
                    return False

        except Exception as e:
            print(f"Error posting to server: {e}")
            return False

    def run(self):
        """Main loop to monitor webcam and detect cats."""
        print(f"\nStarting webcam (index {self.webcam_index})...")
        cap = cv2.VideoCapture(self.webcam_index, cv2.CAP_DSHOW)  # Use DirectShow on Windows

        if not cap.isOpened():
            print("Error: Could not open webcam")
            print("Make sure your webcam is connected and not in use by another application.")
            return

        print("Webcam opened successfully!")
        print(f"Monitoring for cats... (confidence threshold: {CONFIDENCE_THRESHOLD})")
        print(f"Cooldown between detections: {COOLDOWN_SECONDS}s")
        print(f"Server: {SERVER_URL}")
        print("Press 'q' to quit")

        frame_count = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("Error: Could not read frame")
                    break

                # Only process every 10th frame to save CPU
                frame_count += 1
                if frame_count % 10 != 0:
                    cv2.imshow('Cat Detector', frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                    continue

                # Check cooldown
                current_time = time.time()
                if current_time - self.last_detection_time < COOLDOWN_SECONDS:
                    # Draw cooldown timer on frame
                    remaining = int(COOLDOWN_SECONDS - (current_time - self.last_detection_time))
                    cv2.putText(frame, f"Cooldown: {remaining}s", (10, 30),
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
                    cv2.imshow('Cat Detector', frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                    continue

                # Detect cat (and check for person for privacy)
                cat_detected, confidence, person_detected = self.detect_cat(frame)

                # Privacy filter #1: Skip if both person and cat detected
                if cat_detected and person_detected:
                    print(f"⚠ Privacy filter: Person detected with cat, skipping frame")
                    cv2.putText(frame, "PRIVACY: Person detected", (10, 30),
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    cv2.imshow('Cat Detector', frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                    continue

                if cat_detected:
                    print(f"Cat detected! (confidence: {confidence:.2f})")

                    # Save image
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    image_path = SAVE_DIR / f"cat_{timestamp}.jpg"
                    cv2.imwrite(str(image_path), frame)
                    print(f"Saved image: {image_path}")

                    # Describe image
                    description = self.describe_image(image_path)
                    print(f"Description: {description}")

                    # Privacy filter #2: Check if description mentions a person
                    if self.check_person_in_description(description):
                        print(f"⚠ Privacy filter: Description mentions person, skipping post")
                        print(f"  (Image saved locally but not posted)")
                        # Update last detection time to avoid immediate re-detection
                        self.last_detection_time = current_time
                        continue

                    # Determine state
                    state = self.determine_state(description)
                    print(f"State: {state}")

                    # Post to server
                    self.post_to_server(image_path, description, state)

                    # Update last detection time
                    self.last_detection_time = current_time

                    # Draw detection on frame
                    cv2.putText(frame, f"CAT DETECTED! ({confidence:.2f})", (10, 30),
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

                # Display frame
                cv2.imshow('Cat Detector', frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

        finally:
            cap.release()
            cv2.destroyAllWindows()
            print("Webcam released")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Ffion Cat Detector (Windows)")
    print("=" * 60)
    print("Connecting to WSL server at localhost:3000")
    print("=" * 60)
    print()

    # Select camera
    camera_index = select_camera()

    # Initialize detector with selected camera
    detector = CatDetector(webcam_index=camera_index)
    detector.run()


if __name__ == "__main__":
    main()
