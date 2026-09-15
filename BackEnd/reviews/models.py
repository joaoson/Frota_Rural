from django.db import models


class Reviews(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.ForeignKey("rentals.Rentals", models.DO_NOTHING)
    reviewer = models.ForeignKey("users.Users", models.DO_NOTHING)
    reviewee = models.ForeignKey(
        "users.Users", models.DO_NOTHING, related_name="reviews_reviewee_set"
    )
    rating = models.IntegerField()
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "reviews"
        unique_together = (("rental", "reviewer"),)
