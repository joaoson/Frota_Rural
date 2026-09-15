import uuid

from django.utils import timezone
from rest_framework import serializers

from reviews.models import Reviews


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source="reviewer.name", read_only=True)
    reviewee_name = serializers.CharField(source="reviewee.name", read_only=True)

    class Meta:
        model = Reviews
        fields = [
            "id",
            "rental",
            "reviewer",
            "reviewer_name",
            "reviewee",
            "reviewee_name",
            "rating",
            "comment",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        return Reviews.objects.create(
            id=uuid.uuid4(),
            created_at=timezone.now(),
            **validated_data,
        )
