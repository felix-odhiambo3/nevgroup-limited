
import cv2
import easyocr

from huggingface_hub import hf_hub_download
from ultralytics import YOLO


# ==========================================
# CONFIGURATION
# ==========================================

IMAGE_PATH = "test_vehicle.jpeg"
CROP_PATH = "new_plate_crop.jpg"

MODEL_REPO = "ishaqinu/yolo26n-license-plate-detection"
MODEL_FILE = "alpr_26n.pt"

DETECTION_CONFIDENCE = 0.10
IMAGE_SIZE = 640
PADDING_RATIO = 0.15

ALLOWED_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


# ==========================================
# LOAD IMAGE
# ==========================================

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


# ==========================================
# LOAD PLATE DETECTION MODEL
# ==========================================

def load_detector():
    print("Loading plate detector...")

    model_path = hf_hub_download(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE
    )

    return YOLO(model_path, task="detect")


# ==========================================
# DETECT AND CROP PLATE
# ==========================================

def detect_plate(model, image):
    print("Detecting registration plate...")

    results = model.predict(
        image,
        imgsz=IMAGE_SIZE,
        conf=DETECTION_CONFIDENCE,
        device="cpu",
        verbose=False
    )

    boxes = results[0].boxes

    if boxes is None or len(boxes) == 0:
        raise RuntimeError("No registration plate detected.")

    # Select the highest-confidence detection.
    best_index = int(boxes.conf.argmax())

    x1, y1, x2, y2 = (
        boxes.xyxy[best_index]
        .cpu()
        .numpy()
        .astype(int)
    )

    confidence = float(boxes.conf[best_index])

    height, width = image.shape[:2]

    # Add padding around the plate.
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

    print(f"Plate confidence: {confidence:.4f}")
    print(f"Plate crop saved as {CROP_PATH}")

    return plate_crop


# ==========================================
# PREPROCESS PLATE IMAGE
# ==========================================

def preprocess_plate(plate_crop):
    print("\nPreprocessing plate image...")

    gray = cv2.cvtColor(
        plate_crop,
        cv2.COLOR_BGR2GRAY
    )

    # Enlarge image for OCR.
    gray = cv2.resize(
        gray,
        None,
        fx=4,
        fy=4,
        interpolation=cv2.INTER_CUBIC
    )

    # Improve contrast.
    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    enhanced = clahe.apply(gray)

    # Adaptive thresholding.
    threshold = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11
    )

    # Save preprocessing results.
    cv2.imwrite("plate_gray.jpg", gray)
    cv2.imwrite("plate_enhanced.jpg", enhanced)
    cv2.imwrite("plate_threshold.jpg", threshold)

    print("Saved OCR preprocessing images.")

    return {
        "GRAYSCALE": gray,
        "ENHANCED": enhanced,
        "THRESHOLD": threshold
    }


# ==========================================
# RECOGNIZE REGISTRATION TEXT
# ==========================================





def recognize_plate(processed_images):
    print("\nLoading EasyOCR...")
    reader = easyocr.Reader(["en"], gpu=False)

    height, width = processed_images["GRAYSCALE"].shape[:2]

    # Keep the successful crop boundaries.
    top_end = int(height * 0.50)
    bottom_start = int(height * 0.47)

    images = {}

    for name, image in processed_images.items():
        top = image[:top_end, :]
        bottom = image[bottom_start:, :]

        top = cv2.resize(
            top, None, fx=3, fy=3,
            interpolation=cv2.INTER_CUBIC
        )

        bottom = cv2.resize(
            bottom, None, fx=3, fy=3,
            interpolation=cv2.INTER_CUBIC
        )

        images[name] = (top, bottom)
        cv2.imwrite(f"debug_top_{name.lower()}.jpg", top)
        cv2.imwrite(f"debug_bottom_{name.lower()}.jpg", bottom)

    print("\n========== TESTING TOP ROW ==========")

    for name, (top, _) in images.items():
        results = reader.readtext(
            top,
            detail=1,
            paragraph=False,
            allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        )

        detected = "".join(
            item[1].replace(" ", "").upper()
            for item in sorted(
                results,
                key=lambda item: min(point[0] for point in item[0])
            )
            if item[2] >= 0.20
        )

        print(f"{name}: {detected or 'No text detected'}")

    print("\n========== TESTING BOTTOM ROW ==========")

    for name, (_, bottom) in images.items():
        results = reader.readtext(
            bottom,
            detail=1,
            paragraph=False,
            allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        )

        detected = "".join(
            item[1].replace(" ", "").upper()
            for item in sorted(
                results,
                key=lambda item: min(point[0] for point in item[0])
            )
            if item[2] >= 0.20
        )

        print(f"{name}: {detected or 'No text detected'}")

    print("\nOCR comparison completed.")


    def combine_results(results):
        results = sorted(
            results,
            key=lambda item: min(point[0] for point in item[0])
        )

        return "".join(
            item[1].replace(" ", "").upper()
            for item in results
            if item[2] >= 0.20
        )

    top_text = combine_results(top_results)
    bottom_text = combine_results(bottom_results)

    print("\n========== OCR RESULTS ==========")
    print("TOP ROW:", top_text or "Not recognized")
    print("BOTTOM ROW:", bottom_text or "Not recognized")

    if top_text and bottom_text:
        print("COMBINED REGISTRATION:", f"{top_text} {bottom_text}")
    else:
        print("Registration could not be fully recognized.")

    print("=================================")

# ==========================================
# MAIN
# ==========================================

def main():
    try:
        image = load_image()

        model = load_detector()

        plate_crop = detect_plate(
            model,
            image
        )

        processed_images = preprocess_plate(
            plate_crop
        )

        recognize_plate(
            processed_images
        )

        print("\nOCR preprocessing test completed.")

    except Exception as error:
        print(f"\nERROR: {error}")


if __name__ == "__main__":
    main()
