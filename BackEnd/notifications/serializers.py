from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ['id', 'kind', 'title', 'message', 'rental', 'posting', 'contract',
                  'created_at', 'read_at', 'is_read']

    def get_is_read(self, notification) -> bool:
        return notification.read_at is not None


class NotificationListQuerySerializer(serializers.Serializer):
    limit = serializers.IntegerField(min_value=1, max_value=100, default=20)
    offset = serializers.IntegerField(min_value=0, max_value=1_000_000, default=0)
    kind = serializers.ChoiceField(choices=Notification.Kind.choices, required=False)
    unread = serializers.ChoiceField(choices=['true', 'false'], required=False)


class NotificationReadSerializer(serializers.Serializer):
    is_read = serializers.BooleanField()

    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) != {'is_read'} or type(data.get('is_read')) is not bool:
            raise serializers.ValidationError({'is_read': 'Informe apenas is_read como verdadeiro ou falso.'})
        return super().to_internal_value(data)


class NotificationPageSerializer(serializers.Serializer):
    results = NotificationSerializer(many=True)
    count = serializers.IntegerField()
    unread_count = serializers.IntegerField()


class NotificationReadAllSerializer(serializers.Serializer):
    updated = serializers.IntegerField()
    unread_count = serializers.IntegerField()
