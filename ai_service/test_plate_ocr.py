
import cv2
import easyocr

from huggingface_hub import hf_hub_download
from ultralytics import YOLO


# Configuration
IMAGE_PATH = "test_vehicle.jpeg"
CROP_PATH = "plate_crop.jpg"

MODEL_REPO = "Koushim/yolov8-license-plate-detection"
MODEL_FILE = "best.pt"

DETECTION_CONFIDENCE = 0.001
IMAGE_SIZE = 960
PADDING_RATIO = 0.15


def load_image():
    print("Loading image...")

    image = cv2.imread(IMAGE_PATH)

    if image is None:
        raise FileNotFoundError(
            f"Could not read image: {IMAGE_PATH}"
        )

    height, width = image.shape[:2]
    print(f"Image dimensions: {width}x{height}")

    return image


def load_model():
    print("Loading plate detection model...")

    model_path = hf_hub_download(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE
    )

    return YOLO(model_path)


def detect_plate(model, image):
    print("Detecting license plate...")

    results = model.predict(
        image,
        conf=DETECTION_CONFIDENCE,
        imgsz=IMAGE_SIZE,
        verbose=False
    )

    boxes = results[0].boxes

    if boxes is None or len(boxes) == 0:
        raise RuntimeError("No plate candidates found.")

    height, width = image.shape[:2]
    candidates = []

    print("\nTOP 10 PLATE DETECTIONS:")

    sorted_indices = boxes.conf.argsort(descending=True)

    for rank, index in enumerate(sorted_indices[:10], start=1):
        x1, y1, x2, y2 = boxes.xyxy[index].cpu().numpy()
        confidence = float(boxes.conf[index])

        print(
            f"{rank}. Confidence: {confidence:.5f} "
            f"Box: {[round(v, 2) for v in (x1, y1, x2, y2)]}"
        )

    # Filter out implausibly large detections.
    for index, box in enumerate(boxes.xyxy):
        x1, y1, x2, y2 = box.cpu().numpy()

        box_width = x2 - x1
        box_height = y2 - y1
        area_ratio = (box_width * box_height) / (width * height)

        if (
            box_width > 40
            and box_height > 15
            and area_ratio < 0.10
        ):
            candidates.append(index)

    if not candidates:
        raise RuntimeError(
            "No plausible plate-sized candidates found."
        )

    best_index = max(
        candidates,
        key=lambda i: float(boxes.conf[i])
    )

    x1, y1, x2, y2 = (
        boxes.xyxy[best_index].cpu().numpy().astype(int)
    )

    confidence = float(boxes.conf[best_index])

    # Add padding around the detected plate.
    pad_x = int((x2 - x1) * PADDING_RATIO)
    pad_y = int((y2 - y1) * PADDING_RATIO)

    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(width, x2 + pad_x)
    y2 = min(height, y2 + pad_y)

    plate_crop = image[y1:y2, x1:x2]

    if plate_crop.size == 0:
        raise RuntimeError("Invalid plate crop.")

    cv2.imwrite(CROP_PATH, plate_crop)

    print(f"\nSelected detection confidence: {confidence:.5f}")
    print(f"Plate crop saved as {CROP_PATH}")

    return plate_crop


def read_plate(plate_crop):
    print("\nLoading EasyOCR...")

    reader = easyocr.Reader(["en"], gpu=False)

    # Convert BGR to RGB.
    plate_rgb = cv2.cvtColor(
        plate_crop,
        cv2.COLOR_BGR2RGB
    )

    # Enlarge the plate for OCR.
    plate_rgb = cv2.resize(
        plate_rgb,
        None,
        fx=3,
        fy=3,
        interpolation=cv2.INTER_CUBIC
    )

    print("Reading registration plate...")

    results = reader.readtext(
        plate_rgb,
        detail=1,
        paragraph=False
    )

    if not results:
        print("OCR could not read any text.")
        return

    for result in results:
        print(
            f"Detected text: {result[1]} | "
            f"OCR confidence: {result[2]:.4f}"
        )


def main():
    try:
        image = load_image()
        model = load_model()
        plate_crop = detect_plate(model, image)
        read_plate(plate_crop)

        print("\nOCR test completed.")

    except Exception as error:
        print(f"\nERROR: {error}")


if __name__ == "__main__":
    main()
