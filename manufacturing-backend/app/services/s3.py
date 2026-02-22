import boto3
from botocore.exceptions import ClientError
from ..config import get_settings

settings = get_settings()


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


def upload_file_to_s3(file_bytes: bytes, key: str, content_type: str = "application/pdf") -> str:
    """Upload bytes to S3 and return the public URL."""
    client = get_s3_client()
    client.put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    url = f"https://{settings.S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    return url


def download_file_from_s3(key: str) -> bytes:
    """Download a file from S3 by key and return its bytes."""
    client = get_s3_client()
    response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    return response["Body"].read()
