
import cv2
import easyocr

from huggingface_hub import hf_hub_download
from ultralytics import YOLO

IMAGE_PATH = "test_vehicle.jpeg"

print("Loading image...")
image = cv2.imread(IMAGE_PATH)

if image is None:
    raise FileNotFoundError(IMAGE_PATH)

print("Loading plate detector...")

model_path = hf_hub_download(
    repo_id="ishaqinu/yolo26n-license-plate-detection",
    filename="alpr_26n.pt"
)

model = YOLO(model_path, task="detect")

print("Detecting registration plate...")

results = model.predict(
    image,
    imgsz=640,
    conf=0.10,
    device="cpu",
    verbose=False
)

result = results[0]

if result.boxes is None or len(result.boxes) == 0:
    print("No registration plate detected.")
    raise SystemExit

# Select the highest-confidence detection.
best_index = int(result.boxes.conf.argmax())

x1, y1, x2, y2 = (
    result.boxes.xyxy[best_index]
    .cpu()
    .numpy()
    .astype(int)
)

confidence = float(result.boxes.conf[best_index])

height, width = image.shape[:2]

# Add 15% padding.
pad_x = int((x2 - x1) * 0.15)
pad_y = int((y2 - y1) * 0.15)

x1 = max(0, x1 - pad_x)
y1 = max(0, y1 - pad_y)
x2 = min(width, x2 + pad_x)
y2 = min(height, y2 + pad_y)

plate_crop = image[y1:y2, x1:x2]

if plate_crop.size == 0:
    raise RuntimeError("Invalid plate crop.")

cv2.imwrite("new_plate_crop.jpg", plate_crop)

print(f"Plate confidence: {confidence:.4f}")
print("Plate crop saved.")

# Improve image size for OCR.
plate_crop = cv2.resize(
    plate_crop,
    None,
    fx=3,
    fy=3,
    interpolation=cv2.INTER_CUBIC
)

print("Loading EasyOCR...")

reader = easyocr.Reader(["en"], gpu=False)

print("Reading registration number...")

ocr_results = reader.readtext(
    plate_crop,
    detail=1,
    paragraph=False
)

if not ocr_results:
    print("Could not recognize registration text.")
else:
    for detection in ocr_results:
        print(
            f"Text: {detection[1]} | "
            f"Confidence: {detection[2]:.4f}"
        )

print("Recognition test completed.")
