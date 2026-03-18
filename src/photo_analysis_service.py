# photo_analysis_service.py

import asyncio
import base64
import io
import json
import logging
import re
import random
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Tuple, Optional, List, Any

import numpy as np
from PIL import Image, ImageEnhance, ImageOps
from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, field_validator
from jinja2 import Template

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ===== CONFIGURATION =====

class MeasurementConfig:
    """Configuration for measurement rules and ratios"""
    SITTING_RATIOS = {
        "conservative": 0.52,
        "aggressive": 0.51,
        "range": (0.51, 0.54)
    }

    REFERENCE_MEASUREMENTS = {
        "door_height_us": 80,
        "door_width_range": (32, 36),
        "door_handle_height": 36,
        "door_panel_height": 13.33,
        "average_head_size": {
            "male": (9.0, 9.5),
            "female": (8.5, 9.0),
            "overall": (8.5, 9.5)
        },
        "neck_length_range": (3, 5),
        "torso_to_seat_range": (20, 24)
    }

    PROPORTIONAL_RATIOS = {
        "shoulder_to_height": 0.259,
        "chest_to_height": 0.58,
        "waist_to_height": 0.46,
        "neck_to_height": 0.23,
        "inseam_to_height": 0.47,
        "sleeve_to_height": 0.48,
        "head_to_height_range": (1 / 8, 1 / 7.5)
    }

    POPULATION_STATS = {
        "male": {
            "mean_height": 69.1,
            "std_dev": 2.9,
            "min_height": 60,
            "max_height": 84
        },
        "female": {
            "mean_height": 63.7,
            "std_dev": 2.7,
            "min_height": 54,
            "max_height": 78
        }
    }

    SIZE_CHARTS = {
        "shirts": {
            "S": {"chest": (34, 37), "neck": (14, 14.5)},
            "M": {"chest": (38, 40), "neck": (15, 15.5)},
            "L": {"chest": (41, 43), "neck": (16, 16.5)},
            "XL": {"chest": (44, 46), "neck": (17, 17.5)},
            "XXL": {"chest": (47, 50), "neck": (18, 18.5)}
        },
        "jacket_lengths": {
            "S": {"height_range": (0, 67)},
            "R": {"height_range": (67, 71)},
            "L": {"height_range": (71, 75)},
            "XL": {"height_range": (75, 100)}
        }
    }


# ===== PYDANTIC MODELS =====

class SittingMeasurements(BaseModel):
    """Sitting measurements extracted from image"""
    head_height: float = Field(ge=7, le=12, description="Head height in inches")
    neck_length: float = Field(ge=2, le=6, description="Neck length in inches")
    torso_to_seat: float = Field(ge=15, le=30, description="Torso to seat distance in inches")
    total_sitting_height: float = Field(ge=25, le=45, description="Total sitting height in inches")
    seat_compression: float = Field(default=0.5, ge=0, le=2, description="Seat compression in inches")


class HeightCalculations(BaseModel):
    """Different height calculation methods"""
    from_sitting_052: float = Field(description="Height using 0.52 ratio")
    from_sitting_051: float = Field(description="Height using 0.51 ratio")
    from_door_scale: Optional[float] = Field(None, description="Height from door reference")
    from_shoulders: Optional[float] = Field(None, description="Height from shoulder width")
    from_proportions: float = Field(description="Height from body proportions")


class FinalHeight(BaseModel):
    """Final height estimation"""
    inches: int = Field(ge=48, le=96, description="Estimated height in inches")
    confidence: float = Field(ge=0, le=1, description="Confidence score")
    reasoning: str = Field(description="Explanation of calculation")


class BodyMeasurements(BaseModel):
    """Body measurements in inches"""
    shoulders: float = Field(ge=14, le=24, description="Shoulder width")
    chest: float = Field(ge=30, le=60, description="Chest circumference")
    waist: float = Field(ge=24, le=50, description="Waist circumference")
    neck: float = Field(ge=13, le=20, description="Neck circumference")
    inseam: float = Field(ge=24, le=40, description="Inseam length")
    sleeve: float = Field(ge=28, le=38, description="Sleeve length")

    @field_validator('chest')
    @classmethod
    def chest_greater_than_waist(cls, v: float, info) -> float:
        """Ensure chest is larger than waist"""
        if info.data.get('waist') and v <= info.data['waist']:
            # Chest should be larger than waist, adjust if needed
            return info.data['waist'] + 5
        return v


class ClothingSizes(BaseModel):
    """Clothing size determinations"""
    shirt: str = Field(pattern='^(XS|S|M|L|XL|XXL|XXXL)$', description="Shirt size")
    pants: str = Field(pattern=r'^\d{2,3}x\d{2,3}$', description="Pants size (e.g., 32x30)")
    jacket: str = Field(pattern=r'^\d{2,3}[SRLX]+$', description="Jacket size (e.g., 42R)")


class AnalysisResponse(BaseModel):
    """Complete analysis response structure"""
    sitting_measurements: SittingMeasurements
    height_calculations: HeightCalculations
    aggressive_final_height: FinalHeight
    body_measurements: BodyMeasurements
    sizing: ClothingSizes


# ===== ENUMS AND DATACLASSES =====

class BodyType(Enum):
    """Basic body type categories for MVP"""
    RECTANGLE = "rectangle"
    PEAR = "pear"
    APPLE = "apple"
    HOURGLASS = "hourglass"
    INVERTED_TRIANGLE = "inverted_triangle"


class SkinTone(Enum):
    """Basic skin tone categories for MVP"""
    LIGHT = "light"
    MEDIUM = "medium"
    DARK = "dark"


@dataclass
class DetailedSizes:
    """Comprehensive sizing information for accurate shopping"""
    # Height with confidence
    estimated_height_cm: int
    estimated_height_inches: int
    height_confidence: float
    height_visual_cues: str
    height_range: Tuple[int, int]
    height_estimation_method: str

    # Upper body with ranges
    chest_inches: str
    chest_confidence: float
    neck_inches: str
    neck_confidence: float
    sleeve_length: str
    shirt_size: str
    jacket_size: str
    shoulder_width_inches: str

    # Lower body with ranges
    waist_inches: str
    waist_confidence: float
    hip_inches: str
    inseam_inches: str
    inseam_confidence: float
    pant_size: str

    # Shoes
    shoe_size_us: str
    shoe_width: str
    shoe_size_eu: str

    # Fit preferences based on analysis
    preferred_fit: str
    between_sizes_strategy: str

    # Overall confidence
    overall_size_confidence: float
    accuracy_level: str
    most_confident_measurements: List[str]
    least_confident_measurements: List[str]


@dataclass
class PhysicalDescription:
    """Complete physical description for outfit generation"""
    body_type: BodyType
    skin_tone: SkinTone
    skin_undertone: str
    build: str
    muscle_definition: str
    color_recommendations: List[str]
    detailed_sizes: DetailedSizes
    detailed_description: str
    generation_prompt_base: str
    analysis_confidence: float
    analysis_warnings: List[str]
    references_used: List[str]


@dataclass
class PhotoValidationResult:
    """Structure for photo validation results"""
    is_valid: bool
    error_message: Optional[str] = None
    file_size_mb: Optional[float] = None
    dimensions: Optional[Tuple[int, int]] = None
    quality_score: Optional[float] = None
    enhancement_applied: bool = False


# ===== PROMPT TEMPLATES =====

ANALYSIS_PROMPT_TEMPLATE = Template("""
MEASUREMENT EXTRACTION - {{ analysis_mode }} MODE

MEASUREMENT GUIDELINES:

SITTING RATIOS:
- Sitting height typically {{ sitting_ratio_range[0] }}-{{ sitting_ratio_range[1] }}% of standing height
- Use {{ aggressive_ratio }}% for aggressive estimation
- Conservative ratio: {{ conservative_ratio }}%

REFERENCE POINTS:
- US standard door height: {{ door_height }} inches
- Door width range: {{ door_width_range[0] }}-{{ door_width_range[1] }} inches
- Door handle height: {{ door_handle_height }} inches from floor
- Average adult head size: {{ head_size_range[0] }}-{{ head_size_range[1] }} inches
- Neck length typically: {{ neck_length_range[0] }}-{{ neck_length_range[1] }} inches
- Torso to seat (sitting): {{ torso_range[0] }}-{{ torso_range[1] }} inches

BODY PROPORTIONS:
- Shoulder width ≈ {{ shoulder_ratio }}% of height
- Chest circumference ≈ {{ chest_ratio }}% of height
- Waist circumference ≈ {{ waist_ratio }}% of height
- Inseam length ≈ {{ inseam_ratio }}% of height
- Head is 1/{{ head_ratio_min }} to 1/{{ head_ratio_max }} of total height

MEASUREMENT PROCESS:
1. Identify all visible reference points in the image
2. Measure head size using facial landmarks
3. Calculate sitting height (head + neck + torso to seat)
4. Apply sitting-to-standing conversion ratios
5. Cross-check with any visible references (door, objects)
6. Validate using body proportions
7. {{ estimation_instruction }}

CRITICAL: Extract ALL measurements even if you need to estimate. Make educated guesses based on:
- Visible proportions
- Standard human anatomy
- Any reference objects
- Overall build appearance

Return your analysis as a JSON object with this EXACT structure:
{{ output_schema | tojson(indent=2) }}

Remember:
- All measurements in inches
- Be {{ estimation_approach }} with estimates
- Fill ALL fields - no null values
- Confidence should reflect measurement clarity
""")


# ===== MAIN SERVICE CLASS =====

class PhotoAnalysisService:
    """Service for photo analysis with dynamic configuration"""

    # Configuration constants
    MAX_FILE_SIZE_MB = 5
    MIN_RESOLUTION = 400
    ALLOWED_FORMATS = {'JPEG', 'PNG'}

    def __init__(self, anthropic_api_key: str, analysis_mode: str = "aggressive"):
        """Initialize the service with Anthropic API key"""
        self.client = AsyncAnthropic(api_key=anthropic_api_key)
        self.config = MeasurementConfig()
        self.analysis_mode = analysis_mode

    def validate_and_enhance_photo(self, photo_bytes: bytes) -> Tuple[PhotoValidationResult, bytes]:
        """Validate photo meets requirements and enhance for better analysis"""
        try:
            # Check file size
            file_size_mb = len(photo_bytes) / (1024 * 1024)
            if file_size_mb > self.MAX_FILE_SIZE_MB:
                return PhotoValidationResult(
                    is_valid=False,
                    error_message=f"File size {file_size_mb:.2f}MB exceeds maximum {self.MAX_FILE_SIZE_MB}MB",
                    file_size_mb=file_size_mb
                ), photo_bytes

            # Open and validate image
            image = Image.open(io.BytesIO(photo_bytes))

            # Check format
            if image.format not in self.ALLOWED_FORMATS:
                return PhotoValidationResult(
                    is_valid=False,
                    error_message=f"Format {image.format} not allowed. Use JPEG or PNG",
                    file_size_mb=file_size_mb
                ), photo_bytes

            # Check dimensions
            width, height = image.size
            if width < self.MIN_RESOLUTION or height < self.MIN_RESOLUTION:
                return PhotoValidationResult(
                    is_valid=False,
                    error_message=f"Image resolution {width}x{height} below minimum {self.MIN_RESOLUTION}x{self.MIN_RESOLUTION}",
                    file_size_mb=file_size_mb,
                    dimensions=(width, height)
                ), photo_bytes

            # Enhance image for better analysis
            enhanced_image = self._enhance_image_for_analysis(image)

            # Convert back to bytes
            img_byte_arr = io.BytesIO()
            enhanced_image.save(img_byte_arr, format=image.format)
            enhanced_bytes = img_byte_arr.getvalue()

            # Calculate quality score
            quality_score = self._calculate_image_quality_score(enhanced_image)

            return PhotoValidationResult(
                is_valid=True,
                file_size_mb=file_size_mb,
                dimensions=(width, height),
                quality_score=quality_score,
                enhancement_applied=True
            ), enhanced_bytes

        except Exception as e:
            logger.error(f"Error validating photo: {str(e)}")
            return PhotoValidationResult(
                is_valid=False,
                error_message=f"Invalid image file: {str(e)}"
            ), photo_bytes

    def _enhance_image_for_analysis(self, image: Image.Image) -> Image.Image:
        """Enhance image for better measurement extraction"""
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Enhance contrast
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.3)

        # Enhance sharpness
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(1.5)

        # Auto-balance
        image = ImageOps.autocontrast(image, cutoff=1)

        return image

    def _calculate_image_quality_score(self, image: Image.Image) -> float:
        """Calculate quality score based on resolution and sharpness"""
        width, height = image.size
        resolution_score = min(width, height) / 1000.0

        array = np.array(image.convert('L'))
        gradient = np.gradient(array)
        sharpness_score = np.mean(np.abs(gradient)) / 100.0

        quality_score = min(1.0, (resolution_score + sharpness_score) / 2)
        return quality_score

    async def analyze_photo_comprehensive(self, photo_bytes: bytes) -> PhysicalDescription:
        """Comprehensive photo analysis"""
        try:
            # Encode image
            base64_image = base64.b64encode(photo_bytes).decode('utf-8')

            # Get media type
            image = Image.open(io.BytesIO(photo_bytes))
            media_type = f"image/{image.format.lower()}"

            logger.info(f"Starting {self.analysis_mode.upper()} photo analysis...")

            # Perform analysis
            analysis_data = await self._extract_measurements(base64_image, media_type)

            # Create physical description
            return self._create_physical_description(analysis_data)

        except Exception as e:
            logger.error(f"Error in comprehensive analysis: {str(e)}", exc_info=True)
            # Return default description on error
            return self._create_default_description("Analysis error")

    async def _extract_measurements(self, base64_image: str, media_type: str) -> Dict:
        """Extract measurements from image using dynamic prompt"""

        # Generate the prompt
        prompt = self._generate_analysis_prompt()

        try:
            response = await self.client.messages.create(
                model="claude-opus-4-20250514",
                max_tokens=2500,
                temperature=0.1,
                system=self._get_system_prompt(),
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image", "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64_image
                        }}
                    ]
                }]
            )

            response_text = response.content[0].text.strip()

            # Extract JSON using regex for robustness
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)

            if json_match:
                json_str = json_match.group()
                data = json.loads(json_str)

                # Validate with Pydantic
                try:
                    validated_data = AnalysisResponse(**data)
                    return validated_data.model_dump()
                except Exception as validation_error:
                    logger.warning(f"Validation error: {validation_error}")
                    # Return raw data if validation fails but structure is close
                    return self._fix_and_validate_data(data)
            else:
                logger.error("No valid JSON found in response")
                return self._generate_dynamic_defaults()

        except Exception as e:
            logger.error(f"Analysis error: {str(e)}")
            return self._generate_dynamic_defaults()

    def _generate_analysis_prompt(self) -> str:
        """Generate dynamic analysis prompt from template"""
        schema_dict = {
            "sitting_measurements": {
                "head_height": "number (7-12)",
                "neck_length": "number (2-6)",
                "torso_to_seat": "number (15-30)",
                "total_sitting_height": "number (25-45)",
                "seat_compression": "number (0-2, default 0.5)"
            },
            "height_calculations": {
                "from_sitting_052": "number",
                "from_sitting_051": "number",
                "from_door_scale": "number or null",
                "from_shoulders": "number or null",
                "from_proportions": "number"
            },
            "aggressive_final_height": {
                "inches": "integer (48-96)",
                "confidence": "number (0-1)",
                "reasoning": "string"
            },
            "body_measurements": {
                "shoulders": "number (14-24)",
                "chest": "number (30-60)",
                "waist": "number (24-50)",
                "neck": "number (13-20)",
                "inseam": "number (24-40)",
                "sleeve": "number (28-38)"
            },
            "sizing": {
                "shirt": "string (S/M/L/XL/XXL)",
                "pants": "string (e.g., '32x30')",
                "jacket": "string (e.g., '42R')"
            }
        }

        return ANALYSIS_PROMPT_TEMPLATE.render(
            analysis_mode=self.analysis_mode.upper(),
            sitting_ratio_range=[int(r * 100) for r in self.config.SITTING_RATIOS["range"]],
            aggressive_ratio=int(self.config.SITTING_RATIOS["aggressive"] * 100),
            conservative_ratio=int(self.config.SITTING_RATIOS["conservative"] * 100),
            door_height=self.config.REFERENCE_MEASUREMENTS["door_height_us"],
            door_width_range=self.config.REFERENCE_MEASUREMENTS["door_width_range"],
            door_handle_height=self.config.REFERENCE_MEASUREMENTS["door_handle_height"],
            head_size_range=self.config.REFERENCE_MEASUREMENTS["average_head_size"]["overall"],
            neck_length_range=self.config.REFERENCE_MEASUREMENTS["neck_length_range"],
            torso_range=self.config.REFERENCE_MEASUREMENTS["torso_to_seat_range"],
            shoulder_ratio=int(self.config.PROPORTIONAL_RATIOS["shoulder_to_height"] * 100),
            chest_ratio=int(self.config.PROPORTIONAL_RATIOS["chest_to_height"] * 100),
            waist_ratio=int(self.config.PROPORTIONAL_RATIOS["waist_to_height"] * 100),
            inseam_ratio=int(self.config.PROPORTIONAL_RATIOS["inseam_to_height"] * 100),
            head_ratio_min=int(self.config.PROPORTIONAL_RATIOS["head_to_height_range"][1]),
            head_ratio_max=int(self.config.PROPORTIONAL_RATIOS["head_to_height_range"][0]),
            estimation_instruction="Take the HIGHER reasonable estimate" if self.analysis_mode == "aggressive" else "Use balanced estimates",
            estimation_approach="aggressive" if self.analysis_mode == "aggressive" else "conservative",
            output_schema=schema_dict
        )

    def _get_system_prompt(self) -> str:
        """Get system prompt based on analysis mode"""
        if self.analysis_mode == "aggressive":
            return "You are extracting measurements AGGRESSIVELY. Conservative estimates are WRONG. People are generally TALLER than they appear when sitting. Return only valid JSON."
        else:
            return "You are extracting measurements carefully. Be accurate and reasonable. Return only valid JSON."

    def _fix_and_validate_data(self, data: Dict) -> Dict:
        """Fix common issues in extracted data"""
        # Ensure all required fields exist with reasonable defaults
        fixed_data = {
            "sitting_measurements": data.get("sitting_measurements", {}),
            "height_calculations": data.get("height_calculations", {}),
            "aggressive_final_height": data.get("aggressive_final_height", {}),
            "body_measurements": data.get("body_measurements", {}),
            "sizing": data.get("sizing", {})
        }

        # Add missing fields with defaults
        defaults = self._generate_dynamic_defaults()

        for key in fixed_data:
            if not fixed_data[key]:
                fixed_data[key] = defaults[key]
            else:
                # Fill missing subfields
                for subkey, value in defaults[key].items():
                    if subkey not in fixed_data[key]:
                        fixed_data[key][subkey] = value

        return fixed_data

    def _generate_dynamic_defaults(self, assume_gender: str = "male") -> Dict:
        """Generate dynamic defaults based on population statistics"""
        stats = self.config.POPULATION_STATS[assume_gender]

        # Generate height from normal distribution
        base_height = random.normalvariate(stats["mean_height"], stats["std_dev"])
        base_height = max(stats["min_height"], min(stats["max_height"], base_height))

        # Round to nearest inch
        base_height = round(base_height)

        # Calculate sitting height
        sitting_height = base_height * self.config.SITTING_RATIOS["conservative"]

        # Calculate proportional measurements
        measurements = self._calculate_proportional_measurements(base_height)
        sizes = self._calculate_sizes_from_measurements(base_height, measurements)

        return {
            "sitting_measurements": {
                "head_height": round(9.0 * (base_height / stats["mean_height"]), 1),
                "neck_length": 4.0,
                "torso_to_seat": round(sitting_height - 9.0 - 4.0, 1),
                "total_sitting_height": round(sitting_height, 1),
                "seat_compression": 0.5
            },
            "height_calculations": {
                "from_sitting_052": round(sitting_height / 0.52, 1),
                "from_sitting_051": round(sitting_height / 0.51, 1),
                "from_door_scale": None,
                "from_shoulders": round(
                    measurements["shoulders"] / self.config.PROPORTIONAL_RATIOS["shoulder_to_height"], 1),
                "from_proportions": float(base_height)
            },
            "aggressive_final_height": {
                "inches": int(base_height),
                "confidence": 0.7,
                "reasoning": f"Statistical estimate based on {assume_gender} population averages"
            },
            "body_measurements": measurements,
            "sizing": sizes
        }

    def _calculate_proportional_measurements(self, height_inches: float) -> Dict[str, float]:
        """Calculate body measurements based on height using proportional ratios"""
        return {
            "shoulders": round(height_inches * self.config.PROPORTIONAL_RATIOS["shoulder_to_height"], 1),
            "chest": round(height_inches * self.config.PROPORTIONAL_RATIOS["chest_to_height"], 0),
            "waist": round(height_inches * self.config.PROPORTIONAL_RATIOS["waist_to_height"], 0),
            "neck": round(height_inches * self.config.PROPORTIONAL_RATIOS["neck_to_height"], 2),
            "inseam": round(height_inches * self.config.PROPORTIONAL_RATIOS["inseam_to_height"], 0),
            "sleeve": round(height_inches * self.config.PROPORTIONAL_RATIOS["sleeve_to_height"], 0)
        }

    def _calculate_sizes_from_measurements(self, height_inches: float, measurements: Dict[str, float]) -> Dict[
        str, str]:
        """Calculate clothing sizes from measurements"""
        chest = measurements["chest"]
        waist = measurements["waist"]

        # Determine shirt size
        shirt_size = "M"  # Default
        for size, ranges in self.config.SIZE_CHARTS["shirts"].items():
            if ranges["chest"][0] <= chest <= ranges["chest"][1]:
                shirt_size = size
                break

        # Pants size
        waist_size = int(round(waist))
        inseam_size = int(round(measurements["inseam"]))

        # Jacket size
        jacket_chest = int(round(chest))
        jacket_length = "R"  # Default
        for length, data in self.config.SIZE_CHARTS["jacket_lengths"].items():
            if data["height_range"][0] <= height_inches < data["height_range"][1]:
                jacket_length = length
                break

        return {
            "shirt": shirt_size,
            "pants": f"{waist_size}x{inseam_size}",
            "jacket": f"{jacket_chest}{jacket_length}"
        }

    def _create_physical_description(self, analysis_data: Dict) -> PhysicalDescription:
        """Create PhysicalDescription from analysis data"""

        # Extract height data
        height_data = analysis_data.get('aggressive_final_height', {})
        height_inches = int(height_data.get('inches', 70))
        height_cm = int(height_inches * 2.54)
        confidence = float(height_data.get('confidence', 0.7))

        # Get measurements
        body = analysis_data.get('body_measurements', {})
        sizing = analysis_data.get('sizing', {})

        # Determine accuracy level based on confidence
        if confidence >= 0.85:
            accuracy_level = "high"
        elif confidence >= 0.7:
            accuracy_level = "medium"
        else:
            accuracy_level = "low"

        # Height range based on confidence
        range_adjustment = int((1 - confidence) * 3) + 1
        height_range = (height_inches - range_adjustment, height_inches + range_adjustment)

        # Calculate shoe sizes (correlation with height)
        shoe_size_us = round(0.145 * height_inches - 0.2, 1)
        shoe_size_eu = int(shoe_size_us + 33)

        # Determine build based on chest-waist ratio
        chest_waist_ratio = body.get('chest', 42) / body.get('waist', 33)
        if chest_waist_ratio > 1.3:
            build = "athletic"
            muscle_def = "defined"
        elif chest_waist_ratio > 1.15:
            build = "fit"
            muscle_def = "moderate"
        else:
            build = "average"
            muscle_def = "average"

        # Create DetailedSizes
        detailed_sizes = DetailedSizes(
            estimated_height_cm=height_cm,
            estimated_height_inches=height_inches,
            height_confidence=confidence,
            height_visual_cues=f"{self.analysis_mode.capitalize()} analysis with multiple reference points",
            height_range=height_range,
            height_estimation_method=f"{self.analysis_mode.capitalize()} multi-method extraction",

            chest_inches=str(int(body.get('chest', 42))),
            chest_confidence=confidence * 0.95,
            neck_inches=f"{body.get('neck', 15.75):.1f}",
            neck_confidence=confidence * 0.9,
            sleeve_length=str(int(body.get('sleeve', 33))),
            shirt_size=sizing.get('shirt', 'L'),
            jacket_size=sizing.get('jacket', '42R'),
            shoulder_width_inches=f"{body.get('shoulders', 18.5):.1f}",

            waist_inches=str(int(body.get('waist', 33))),
            waist_confidence=confidence * 0.95,
            hip_inches=str(int(body.get('waist', 33) + 7)),
            inseam_inches=str(int(body.get('inseam', 32))),
            inseam_confidence=confidence * 0.85,
            pant_size=sizing.get('pants', '33x32'),

            shoe_size_us=f"{shoe_size_us:.1f}",
            shoe_width="D",
            shoe_size_eu=str(shoe_size_eu),

            preferred_fit="athletic fit" if build == "athletic" else "regular fit",
            between_sizes_strategy="true to size",

            overall_size_confidence=confidence,
            accuracy_level=accuracy_level,
            most_confident_measurements=["height", "chest", "shoulders", "waist"],
            least_confident_measurements=["inseam"] if confidence < 0.8 else []
        )

        # Determine body type
        if build == "athletic":
            body_type = BodyType.INVERTED_TRIANGLE
        elif chest_waist_ratio < 1.1:
            body_type = BodyType.RECTANGLE
        else:
            body_type = BodyType.RECTANGLE  # Default for MVP

        # Color recommendations based on assumed skin tone
        color_recommendations = [
            "navy", "charcoal", "white", "black", "olive",
            "burgundy", "light blue", "forest green", "camel"
        ]

        # Create warnings
        warnings = []
        if confidence < 0.7:
            warnings.append("Low confidence in measurements - consider providing clearer photo")
        if analysis_data.get('height_calculations', {}).get('from_door_scale') is None:
            warnings.append("No door reference visible - measurements based on body proportions")

        return PhysicalDescription(
            body_type=body_type,
            skin_tone=SkinTone.MEDIUM,  # Default for MVP
            skin_undertone="neutral",
            build=build,
            muscle_definition=muscle_def,
            color_recommendations=color_recommendations,
            detailed_sizes=detailed_sizes,
            detailed_description=f"{height_inches} inches tall ({height_cm}cm) with {build} build",
            generation_prompt_base=f"A {height_inches} inch tall person with {build} build",
            analysis_confidence=confidence,
            analysis_warnings=warnings,
            references_used=self._get_references_used(analysis_data)
        )

    def _get_references_used(self, analysis_data: Dict) -> List[str]:
        """Determine which references were used in analysis"""
        references = ["sitting ratio", "body proportions"]

        height_calcs = analysis_data.get('height_calculations', {})
        if height_calcs.get('from_door_scale') is not None:
            references.append("door scale")
        if height_calcs.get('from_shoulders') is not None:
            references.append("shoulder width")

        return references

    def _create_default_description(self, reason: str) -> PhysicalDescription:
        """Create default description when analysis fails"""
        defaults = self._generate_dynamic_defaults()
        return self._create_physical_description(defaults)

    async def process_photo(self, photo_bytes: bytes) -> Dict:
        """Main entry point for photo processing"""

        # Validate and enhance
        validation, enhanced_bytes = self.validate_and_enhance_photo(photo_bytes)

        if not validation.is_valid:
            return {
                "success": False,
                "error": validation.error_message,
                "validation": {
                    "file_size_mb": validation.file_size_mb,
                    "dimensions": validation.dimensions
                }
            }

        # Analyze
        try:
            description = await self.analyze_photo_comprehensive(enhanced_bytes)
            return self._format_output(description, validation)

        except Exception as e:
            logger.error(f"Processing error: {str(e)}")
            description = self._create_default_description("Processing error")
            return self._format_output(description, validation)

    def _format_output(self, description: PhysicalDescription, validation: PhotoValidationResult) -> Dict:
        """Format output for API response"""

        height_feet = description.detailed_sizes.estimated_height_inches // 12
        height_remainder = description.detailed_sizes.estimated_height_inches % 12

        return {
            "success": True,
            "validation": {
                "file_size_mb": validation.file_size_mb,
                "dimensions": validation.dimensions,
                "quality_score": validation.quality_score,
                "enhancement_applied": validation.enhancement_applied
            },
            "analysis": {
                "accuracy_level": description.detailed_sizes.accuracy_level,
                "analysis_mode": self.analysis_mode,
                "estimated_height": {
                    "display": f"{height_feet}'{height_remainder}\" ({description.detailed_sizes.estimated_height_cm}cm)",
                    "inches": description.detailed_sizes.estimated_height_inches,
                    "cm": description.detailed_sizes.estimated_height_cm,
                    "confidence": description.detailed_sizes.height_confidence,
                    "range": f"{description.detailed_sizes.height_range[0]}-{description.detailed_sizes.height_range[1]} inches",
                    "method": description.detailed_sizes.height_estimation_method
                },

                "measurements": {
                    "chest": {
                        "value": description.detailed_sizes.chest_inches,
                        "confidence": description.detailed_sizes.chest_confidence
                    },
                    "waist": {
                        "value": description.detailed_sizes.waist_inches,
                        "confidence": description.detailed_sizes.waist_confidence
                    },
                    "neck": {
                        "value": description.detailed_sizes.neck_inches,
                        "confidence": description.detailed_sizes.neck_confidence
                    },
                    "inseam": {
                        "value": description.detailed_sizes.inseam_inches,
                        "confidence": description.detailed_sizes.inseam_confidence
                    },
                    "shoulders": description.detailed_sizes.shoulder_width_inches,
                    "sleeve": description.detailed_sizes.sleeve_length
                },

                "sizes": {
                    "shirts": {
                        "size": description.detailed_sizes.shirt_size,
                        "dress_shirt": f"{description.detailed_sizes.neck_inches}/{description.detailed_sizes.sleeve_length}",
                        "fit_preference": description.detailed_sizes.preferred_fit
                    },
                    "pants": {
                        "size": description.detailed_sizes.pant_size
                    },
                    "jacket": description.detailed_sizes.jacket_size,
                    "shoes": {
                        "us": description.detailed_sizes.shoe_size_us,
                        "eu": description.detailed_sizes.shoe_size_eu,
                        "width": description.detailed_sizes.shoe_width
                    }
                },

                "build_analysis": {
                    "build_type": description.build,
                    "body_type": description.body_type.value,
                    "muscle_definition": description.muscle_definition
                },

                "color_recommendations": description.color_recommendations,
                "references_used": description.references_used,

                "confidence": {
                    "overall": description.analysis_confidence,
                    "accuracy_level": description.detailed_sizes.accuracy_level
                },

                "warnings": description.analysis_warnings
            }
        }

    def create_outfit_generation_prompt(self, description: PhysicalDescription, event_description: str) -> str:
        """Create prompt for outfit generation"""

        height_feet = description.detailed_sizes.estimated_height_inches // 12
        height_remainder = description.detailed_sizes.estimated_height_inches % 12

        return f"""
        Create a perfect outfit for this individual:

        PHYSICAL PROFILE:
        - Height: {height_feet}'{height_remainder}" ({description.detailed_sizes.estimated_height_cm}cm)
        - Build: {description.build} with {description.muscle_definition} muscle definition
        - Body type: {description.body_type.value}

        EXACT MEASUREMENTS:
        - Chest: {description.detailed_sizes.chest_inches}"
        - Waist: {description.detailed_sizes.waist_inches}"
        - Neck: {description.detailed_sizes.neck_inches}"
        - Shoulders: {description.detailed_sizes.shoulder_width_inches}"
        - Inseam: {description.detailed_sizes.inseam_inches}"
        - Sleeve: {description.detailed_sizes.sleeve_length}"

        SIZING:
        - Shirts: {description.detailed_sizes.shirt_size} ({description.detailed_sizes.preferred_fit})
        - Pants: {description.detailed_sizes.pant_size}
        - Jackets: {description.detailed_sizes.jacket_size}
        - Shoes: US {description.detailed_sizes.shoe_size_us}

        COLOR PALETTE:
        Best colors: {', '.join(description.color_recommendations[:6])}

        EVENT: {event_description}

        Create an outfit that:
        1. Fits these exact measurements
        2. Suits the {event_description} perfectly
        3. Includes specific items with sizes
        4. Complements the {description.build} build
        """


# Example usage
async def main():
    """Example of how to use the PhotoAnalysisService"""
    # These would come from your API/environment
    image_path = "/Users/william/fashion/src/IMG_5646.jpg"
    api_key = "REDACTED_API_KEY"

    # Initialize service with desired mode
    service = PhotoAnalysisService(api_key, analysis_mode="aggressive")

    try:
        with open(image_path, "rb") as f:
            photo_bytes = f.read()

        print(f"Analyzing photo with {service.analysis_mode.upper()} extraction...")
        result = await service.process_photo(photo_bytes)

        if result["success"]:
            print("\n=== ANALYSIS RESULTS ===")
            analysis = result["analysis"]
            print(f"Analysis Mode: {analysis['analysis_mode']}")
            print(f"Height: {analysis['estimated_height']['display']}")
            print(f"Confidence: {analysis['estimated_height']['confidence']:.0%}")
            print(f"Build: {analysis['build_analysis']['build_type']}")
            print(f"Shirt size: {analysis['sizes']['shirts']['size']}")
            print(f"Pant size: {analysis['sizes']['pants']['size']}")
            print("\nFull analysis:")
            print(json.dumps(analysis, indent=2))
        else:
            print(f"\nError: {result['error']}")

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())