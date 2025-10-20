#!/usr/bin/env python3
"""
Cat detector test script - processes images from test_images folder.
Tests YOLO detection, Moondream descriptions, and privacy filters without requiring a live camera.
"""

import cv2
from pathlib import Path
from ultralytics import YOLO
import torch
from PIL import Image
from transformers import AutoModelForCausalLM, AutoTokenizer
import argparse

# Configuration
CONFIDENCE_THRESHOLD = 0.5
CAT_CLASS_ID = 15  # COCO dataset class ID for 'cat'
PERSON_CLASS_ID = 0  # COCO dataset class ID for 'person'
TEST_DIR = Path("./test_images")

# States for Ffion
STATES = {
    "eating": "com.ffion.eating",
    "zoomies": "com.ffion.zoomies",
    "playing": "com.ffion.playing",
    "sleeping": "com.ffion.sleeping"
}


class CatDetectorTest:
    def __init__(self, use_gpu=False):
        """Initialize the cat detector with YOLO and vision models."""
        # Force CPU or allow GPU
        if use_gpu and torch.cuda.is_available():
            self.device = "cuda"
            print("Using GPU (CUDA)")
        else:
            self.device = "cpu"
            print("Using CPU (forced)")
            # Disable CUDA completely to avoid memory errors
            torch.cuda.is_available = lambda: False

        print("Loading YOLO model...")
        self.yolo_model = YOLO('yolov8n.pt')  # Using YOLOv8 nano for speed
        print("YOLO model loaded!")

        print("Loading Moondream vision model...")
        model_id = "vikhyatk/moondream2"
        revision = "2025-06-21"  # Stable revision with better quality
        self.vision_model = AutoModelForCausalLM.from_pretrained(
            model_id,
            revision=revision,
            trust_remote_code=True,
            torch_dtype=torch.float32,  # Always use float32 for CPU compatibility
            device_map={"": self.device}
        )
        self.vision_tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
        print(f"Vision model loaded! (Using {self.device.upper()})")

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

            # Generate description with a cat-focused prompt using Moondream's query method
            prompt = "Describe what this cat is doing in one short sentence."
            description = self.vision_model.query(image, prompt)["answer"]

            # Clean up the description
            description = description.strip()

            # Ensure it's not too long
            if len(description) > 100:
                description = description[:97] + "..."

            return description

        except Exception as e:
            print(f"Error generating image description: {e}")
            import traceback
            traceback.print_exc()
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

    def process_images(self):
        """Process all images in the test_images folder."""
        if not TEST_DIR.exists():
            print(f"\nError: {TEST_DIR} directory not found!")
            print(f"Please create a '{TEST_DIR}' folder and add some test images.")
            return

        # Find all image files
        image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.bmp', '*.gif']
        image_files = []
        for ext in image_extensions:
            image_files.extend(TEST_DIR.glob(ext))
            image_files.extend(TEST_DIR.glob(ext.upper()))

        if not image_files:
            print(f"\nNo images found in {TEST_DIR}")
            print("Supported formats: jpg, jpeg, png, bmp, gif")
            return

        image_files = sorted(image_files)
        print(f"\nFound {len(image_files)} image(s) in {TEST_DIR}")
        print("=" * 80)

        # Process each image
        for i, image_path in enumerate(image_files, 1):
            print(f"\n[{i}/{len(image_files)}] Processing: {image_path.name}")
            print("-" * 80)

            try:
                # Read image
                frame = cv2.imread(str(image_path))
                if frame is None:
                    print(f"  Error: Could not read image {image_path.name}")
                    continue

                # Detect cat and person
                cat_detected, confidence, person_detected = self.detect_cat(frame)

                print(f"  Cat detected: {cat_detected}")
                if cat_detected:
                    print(f"  Confidence: {confidence:.2f}")
                print(f"  Person detected: {person_detected}")

                # Privacy filter #1: Skip if both person and cat detected
                if cat_detected and person_detected:
                    print(f"  \u26a0 PRIVACY FILTER #1: Person detected with cat, would skip this image")
                    continue

                if cat_detected:
                    # Describe image
                    print(f"  Generating description...")
                    description = self.describe_image(image_path)
                    print(f"  Description: {description}")

                    # Privacy filter #2: Check if description mentions a person
                    if self.check_person_in_description(description):
                        print(f"  \u26a0 PRIVACY FILTER #2: Description mentions person, would skip posting")
                        continue

                    # Determine state
                    state = self.determine_state(description)
                    print(f"  State: {state}")
                    print(f"  \u2713 Would post to server!")
                else:
                    print(f"  No cat detected in this image")

            except Exception as e:
                print(f"  Error processing {image_path.name}: {e}")
                import traceback
                traceback.print_exc()

        print("\n" + "=" * 80)
        print("Test complete!")


def main():
    """Main entry point."""
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Test cat detector on images')
    parser.add_argument('--gpu', action='store_true', help='Enable GPU/CUDA (default: CPU only)')
    args = parser.parse_args()

    print("=" * 80)
    print("Ffion Cat Detector - Test Mode")
    print("=" * 80)
    print(f"Processing images from: {TEST_DIR}")
    print(f"Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print(f"GPU enabled: {args.gpu}")
    print("=" * 80)

    # Initialize detector
    detector = CatDetectorTest(use_gpu=args.gpu)

    # Process all images
    detector.process_images()


if __name__ == "__main__":
    main()
