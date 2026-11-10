
import os
import re
import logging
import threading

from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path

import cv2
import easyocr
import numpy as np

from PIL import Image, ImageOps, UnidentifiedImageError
from huggingface_hub import hf_hub_download
from ultralytics import YOLO

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


# =========================================================
# CONFIGURATION
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

VEHICLE_MODEL_PATH = os.getenv(
    "VEHICLE_MODEL_PATH",
    str(BASE_DIR / "yolov8n.pt")
)

PLATE_MODEL_PATH = os.getenv(
    "PLATE_MODEL_PATH",
    str(BASE_DIR / "license_plate_detector.pt")
)

PLATE_MODEL_REPO = "Koushim/yolov8-license-plate-detection"
PLATE_MODEL_FILENAME = "best.pt"

MAX_IMAGE_SIZE = int(
    os.getenv("MAX_IMAGE_SIZE", str(10 * 1024 * 1024))
)

# 0.15 is retained from your previous diagnostic test.
# Calibrate this threshold before production deployment.
VEHICLE_CONFIDENCE = float(
    os.getenv("VEHICLE_CONFIDENCE", "0.15")
)

PLATE_CONFIDENCE = float(
    os.getenv("PLATE_CONFIDENCE", "0.30")
)

OCR_MIN_CONFIDENCE = float(
    os.getenv("OCR_MIN_CONFIDENCE", "0.20")
)

IMAGE_SIZE = int(os.getenv("IMAGE_SIZE", "960"))

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:8000"
    ).split(",")
    if origin.strip()
]

VEHICLE_CLASSES = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("vehicle_ai")


# =========================================================
# GLOBAL MODEL INSTANCES
# =========================================================

vehicle_model = None
plate_model = None
ocr_reader = None

inference_lock = threading.Lock()


# =========================================================
# MODEL INITIALIZATION
# =========================================================

def load_plate_model():
    """
    Load the local license plate model.

    If the local weights do not exist, download the
    configured model from Hugging Face.
    """

    local_path = Path(PLATE_MODEL_PATH)

    if local_path.is_file():
        logger.info("Loading local plate model: %s", local_path)
        return YOLO(str(local_path))

    logger.info("Downloading public license plate model...")

    downloaded_path = hf_hub_download(
        repo_id=PLATE_MODEL_REPO,
        filename=PLATE_MODEL_FILENAME
    )

    logger.info("Plate model downloaded: %s", downloaded_path)

    return YOLO(downloaded_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize AI models when the application starts.
    """

    global vehicle_model, plate_model, ocr_reader

    logger.info("Initializing vehicle recognition service...")

    try:
        vehicle_model = YOLO(VEHICLE_MODEL_PATH)

        plate_model = load_plate_model()

        logger.info(
            "VEHICLE MODEL CLASSES: %s",
            vehicle_model.names
        )

        logger.info(
            "PLATE MODEL CLASSES: %s",
            plate_model.names
        )

        ocr_reader = easyocr.Reader(
            ["en"],
            gpu=os.getenv("OCR_GPU", "false").lower() == "true"
        )

        logger.info("All AI models initialized successfully.")

    except Exception:
        logger.exception("AI model initialization failed.")
        raise

    yield

    logger.info("Shutting down vehicle recognition service.")


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="NEV CARWASH Vehicle Recognition API",
    description=(
        "AI-powered vehicle classification and "
        "license plate recognition service."
    ),
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# =========================================================
# IMAGE VALIDATION AND DECODING
# =========================================================

def decode_image(image_bytes: bytes) -> np.ndarray:
    """
    Validate and decode an uploaded image.

    Returns an RGB NumPy array.
    """

    try:
        with Image.open(BytesIO(image_bytes)) as image:

            if image.format not in ("JPEG", "PNG", "WEBP"):
                raise HTTPException(
                    status_code=415,
                    detail={
                        "status": "error",
                        "message": (
                            "Only JPEG, PNG and WEBP images "
                            "are supported."
                        )
                    }
                )

            image = ImageOps.exif_transpose(image)
            image = image.convert("RGB")

            if image.width < 64 or image.height < 64:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "status": "error",
                        "message": "Image resolution is too small."
                    }
                )

            if image.width * image.height > 25_000_000:
                raise HTTPException(
                    status_code=413,
                    detail={
                        "status": "error",
                        "message": (
                            "Image resolution exceeds "
                            "the allowed limit."
                        )
                    }
                )

            return np.asarray(image).copy()

    except HTTPException:
        raise

    except (
        UnidentifiedImageError,
        OSError,
        ValueError
    ):
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error",
                "message": "The uploaded file is not a valid image."
            }
        )


# =========================================================
# VEHICLE DETECTION
# =========================================================

def detect_vehicle(image: np.ndarray):
    """
    Detect vehicles using YOLOv8 COCO classes.

    Returns the highest-confidence supported vehicle.
    """

    bgr_image = cv2.cvtColor(
        image,
        cv2.COLOR_RGB2BGR
    )

    results = vehicle_model.predict(
        source=bgr_image,
        imgsz=IMAGE_SIZE,
        conf=VEHICLE_CONFIDENCE,
        classes=list(VEHICLE_CLASSES.keys()),
        verbose=False
    )

    if not results or results[0].boxes is None:
        logger.info("No vehicle detections returned.")
        return None

    detections = results[0].boxes

    if len(detections) == 0:
        logger.info("No supported vehicles detected.")
        return None

    best_detection = None

    for detection in detections:

        class_id = int(detection.cls[0].item())
        confidence = float(detection.conf[0].item())

        if class_id not in VEHICLE_CLASSES:
            continue

        if (
            best_detection is None
            or confidence > best_detection["confidence"]
        ):

            coordinates = (
                detection.xyxy[0]
                .cpu()
                .numpy()
                .astype(int)
            )

            best_detection = {
                "vehicle_type": VEHICLE_CLASSES[class_id],
                "confidence": confidence,
                "box": coordinates
            }

    if best_detection:
        logger.info(
            "VEHICLE DETECTED: type=%s confidence=%.4f box=%s",
            best_detection["vehicle_type"],
            best_detection["confidence"],
            best_detection["box"].tolist()
        )

    return best_detection


# =========================================================
# LICENSE PLATE DETECTION
# =========================================================

def detect_license_plate(image: np.ndarray, vehicle_box):
    """
    Detect license plates using the dedicated YOLO model.

    Prefer plate detections whose centers are inside
    the detected vehicle bounding box.
    """

    bgr_image = cv2.cvtColor(
        image,
        cv2.COLOR_RGB2BGR
    )

    results = plate_model.predict(
        source=bgr_image,
        imgsz=IMAGE_SIZE,
        conf=PLATE_CONFIDENCE,
        verbose=False
    )

    logger.info(
        "PLATE DETECTOR CLASSES: %s",
        plate_model.names
    )

    if not results or results[0].boxes is None:
        logger.info("Plate detector returned no boxes.")
        return None

    detections = results[0].boxes

    logger.info(
        "PLATE DETECTIONS FOUND: %s",
        len(detections)
    )

    if len(detections) == 0:
        return None

    vx1, vy1, vx2, vy2 = vehicle_box

    inside_vehicle = []
    all_detections = []

    height, width = image.shape[:2]

    for detection in detections:

        confidence = float(detection.conf[0].item())

        coordinates = (
            detection.xyxy[0]
            .cpu()
            .numpy()
            .astype(int)
        )

        x1, y1, x2, y2 = coordinates

        logger.info(
            "PLATE BOX: coordinates=%s confidence=%.4f class=%s",
            coordinates.tolist(),
            confidence,
            int(detection.cls[0].item())
        )

        # Keep coordinates within image boundaries.
        x1 = max(0, min(x1, width - 1))
        y1 = max(0, min(y1, height - 1))
        x2 = max(0, min(x2, width))
        y2 = max(0, min(y2, height))

        if x2 <= x1 or y2 <= y1:
            continue

        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2

        candidate = {
            "box": (x1, y1, x2, y2),
            "confidence": confidence
        }

        all_detections.append(candidate)

        if (
            vx1 <= center_x <= vx2
            and vy1 <= center_y <= vy2
        ):
            inside_vehicle.append(candidate)

    # Prefer detections inside the vehicle.
    # Fall back to all detections if necessary.
    candidates = inside_vehicle or all_detections

    if not candidates:
        logger.info("No valid plate candidates found.")
        return None

    best_plate = max(
        candidates,
        key=lambda item: item["confidence"]
    )

    logger.info(
        "SELECTED PLATE: box=%s confidence=%.4f",
        best_plate["box"],
        best_plate["confidence"]
    )

    return best_plate


# =========================================================
# LICENSE PLATE IMAGE PREPROCESSING
# =========================================================

def preprocess_plate(image: np.ndarray, box):
    """
    Crop and enhance a detected license plate
    before passing it to EasyOCR.
    """

    x1, y1, x2, y2 = box

    height, width = image.shape[:2]

    # Add a small margin around the plate.
    margin_x = int((x2 - x1) * 0.05)
    margin_y = int((y2 - y1) * 0.15)

    x1 = max(0, x1 - margin_x)
    y1 = max(0, y1 - margin_y)
    x2 = min(width, x2 + margin_x)
    y2 = min(height, y2 + margin_y)

    plate_crop = image[y1:y2, x1:x2]

    if plate_crop.size == 0:
        logger.warning("Plate crop is empty.")
        return None

    gray = cv2.cvtColor(
        plate_crop,
        cv2.COLOR_RGB2GRAY
    )

    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    enhanced = clahe.apply(gray)

    denoised = cv2.bilateralFilter(
        enhanced,
        9,
        75,
        75
    )

    enlarged = cv2.resize(
        denoised,
        None,
        fx=3,
        fy=3,
        interpolation=cv2.INTER_CUBIC
    )

    return enlarged


# =========================================================
# OCR TEXT EXTRACTION
# =========================================================

def extract_plate_text(plate_image: np.ndarray):
    """
    Extract license plate characters using EasyOCR.

    Returns cleaned text and OCR confidence.
    """

    if plate_image is None:
        return None

    ocr_results = ocr_reader.readtext(
        plate_image,
        detail=1,
        paragraph=False,
        allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )

    candidates = []

    for result in ocr_results:

        if len(result) < 3:
            continue

        raw_text = result[1]
        confidence = float(result[2])

        cleaned_text = re.sub(
            r"[^A-Z0-9]",
            "",
            raw_text.upper()
        )

        if not cleaned_text:
            continue

        if confidence < OCR_MIN_CONFIDENCE:
            continue

        candidates.append({
            "text": cleaned_text,
            "confidence": confidence
        })

    if not candidates:
        logger.info("OCR could not read the plate reliably.")
        return None

    best_result = max(
        candidates,
        key=lambda item: item["confidence"]
    )

    logger.info(
        "OCR RESULT: text=%s confidence=%.4f",
        best_result["text"],
        best_result["confidence"]
    )

    return best_result


# =========================================================
# API ENDPOINT
# =========================================================

@app.post("/api/scan-vehicle")
def scan_vehicle(file: UploadFile = File(...)):
    """
    Accept a vehicle image and return:

    - Vehicle type
    - License plate text
    - Vehicle detection confidence
    - OCR confidence
    """

    if (
        vehicle_model is None
        or plate_model is None
        or ocr_reader is None
    ):
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "message": "AI recognition service is not ready."
            }
        )

    try:

        allowed_types = {
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/octet-stream"
        }

        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=415,
                detail={
                    "status": "error",
                    "message": "Unsupported image file format."
                }
            )

        image_bytes = file.file.read(
            MAX_IMAGE_SIZE + 1
        )

        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "error",
                    "message": "No image was uploaded."
                }
            )

        if len(image_bytes) > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=413,
                detail={
                    "status": "error",
                    "message": "Image exceeds the maximum upload size."
                }
            )

        image = decode_image(image_bytes)

        # Serialize access to shared AI model instances.
        with inference_lock:

            # STEP 1: Vehicle detection.
            vehicle = detect_vehicle(image)

            if vehicle is None:
                return JSONResponse(
                    status_code=422,
                    content={
                        "status": "vehicle_not_found",
                        "message": "No supported vehicle was detected.",
                        "vehicle_type": None,
                        "license_plate": None,
                        "confidence": {
                            "vehicle": None,
                            "plate_text": None
                        }
                    }
                )

            # STEP 2: License plate detection.
            plate = detect_license_plate(
                image,
                vehicle["box"]
            )

            if plate is None:
                return JSONResponse(
                    status_code=200,
                    content={
                        "status": "plate_not_found",
                        "message": (
                            "Vehicle detected, but no license "
                            "plate was found."
                        ),
                        "vehicle_type": vehicle["vehicle_type"],
                        "license_plate": None,
                        "confidence": {
                            "vehicle": round(
                                vehicle["confidence"], 4
                            ),
                            "plate_text": None
                        }
                    }
                )

            # STEP 3: Crop and preprocess the plate.
            plate_image = preprocess_plate(
                image,
                plate["box"]
            )

            # STEP 4: Extract plate text.
            ocr_result = extract_plate_text(plate_image)

        if ocr_result is None:
            return JSONResponse(
                status_code=200,
                content={
                    "status": "plate_text_not_read",
                    "message": (
                        "Plate detected, but its text could "
                        "not be read reliably."
                    ),
                    "vehicle_type": vehicle["vehicle_type"],
                    "license_plate": None,
                    "confidence": {
                        "vehicle": round(
                            vehicle["confidence"], 4
                        ),
                        "plate_text": None
                    }
                }
            )

        # STEP 5: Successful recognition.
        return {
            "status": "success",
            "vehicle_type": vehicle["vehicle_type"],
            "license_plate": ocr_result["text"],
            "confidence": {
                "vehicle": round(
                    vehicle["confidence"], 4
                ),
                "plate_text": round(
                    ocr_result["confidence"], 4
                )
            }
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("Vehicle recognition failed.")

        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": (
                    "An internal vehicle recognition "
                    "error occurred."
                )
            }
        )

    finally:
        file.file.close()


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health_check():

    ready = all([
        vehicle_model is not None,
        plate_model is not None,
        ocr_reader is not None
    ])

    return {
        "service": "NEV CARWASH Vehicle Recognition API",
        "status": "ready" if ready else "initializing",
        "models": {
            "vehicle_detection": vehicle_model is not None,
            "plate_detection": plate_model is not None,
            "ocr": ocr_reader is not None
        }
    }


# =========================================================
# APPLICATION ENTRY POINT
# =========================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8001")),
        reload=False,
        workers=1
    )
