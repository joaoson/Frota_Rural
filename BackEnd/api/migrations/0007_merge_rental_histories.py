from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0005_move_rentals_reviews_to_own_apps"),
        ("api", "0006_rental_reservation_expiry"),
    ]

    operations = []
