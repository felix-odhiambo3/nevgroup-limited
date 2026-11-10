
import os
import cv2

from pathlib import Path
from ultralytics import YOLO
from huggingface_hub import hf_hub_download

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = Path(
    os.getenv(
        "PLATE_MODEL_PATH",
        str(BASE_DIR / "license_plate_detector.pt")
    )
)

IMAGE_PATH = BASE_DIR / "test_vehicle.jpeg"

if not IMAGE_PATH.exists():
    raise FileNotFoundError(f"Image not found: {IMAGE_PATH}")

if MODEL_PATH.is_file():
    model_path = str(MODEL_PATH)
else:
    model_path = hf_hub_download(
        repo_id="Koushim/yolov8-license-plate-detection",
        filename="best.pt"
    )

print("Loading plate detection model...")
model = YOLO(model_path)

image = cv2.imread(str(IMAGE_PATH))

if image is None:
    raise ValueError("Could not read the test image.")

print("Image dimensions:", image.shape)
print("Model classes:", model.names)
print("Model weights:", model_path)

print("\nRunning diagnostic inference...")

results = model.predict(
    source=image,
    imgsz=1280,
    conf=0.001,
    verbose=False
)

result = results[0]
boxes = result.boxes

print("\nDETECTIONS:", len(boxes) if boxes is not None else 0)

if boxes is not None:
    for index, detection in enumerate(boxes):
        print(
            f"Detection {index + 1}:",
            "Box:", detection.xyxy[0].cpu().numpy().tolist(),
            "Confidence:", round(float(detection.conf[0]), 5),
            "Class:", int(detection.cls[0])
        )

annotated = result.plot()

output_path = BASE_DIR / "plate_debug.jpg"

cv2.imwrite(str(output_path), annotated)

print("\nAnnotated image saved to:", output_path)
