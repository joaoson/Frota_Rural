"""Keep both deployed migration histories valid while Rentals changes apps.

The recurrence branch and the app-move branch were deployed independently.
Neither can gain a dependency on migrations absent from its deployed history.
These operations therefore locate Rentals in the historical state; the final
merge converges both orders without recreating or renaming its database table.
"""

from copy import copy

from django.db import migrations


def rental_app(state):
    if ("api", "rentals") in state.models:
        return "api"
    if ("rentals", "rentals") in state.models:
        return "rentals"
    raise ValueError("Rental migration state is missing both model locations.")


class RentalOperation:
    def state_forwards(self, app_label, state):
        super().state_forwards(rental_app(state), state)

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        super().database_forwards(rental_app(from_state), schema_editor, from_state, to_state)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        super().database_backwards(rental_app(from_state), schema_editor, from_state, to_state)


class AddRentalField(RentalOperation, migrations.AddField):
    pass


class AddRentalConstraint(RentalOperation, migrations.AddConstraint):
    pass


class CreateModelWithRentalReference(migrations.CreateModel):
    def state_forwards(self, app_label, state):
        operation = copy(self)
        operation.fields = []
        for name, field in self.fields:
            relation = getattr(field, "remote_field", None)
            if relation and str(relation.model).lower() == "api.rentals":
                field = field.clone()
                field.remote_field.model = f"{rental_app(state)}.rentals"
            operation.fields.append((name, field))
        migrations.CreateModel.state_forwards(operation, app_label, state)


class DeleteLegacyRentalState(migrations.DeleteModel):
    """Carry feature state and incoming references across a state-only move."""

    def state_forwards(self, app_label, state):
        legacy = state.models[("api", "rentals")]
        current = state.models[("rentals", "rentals")]
        for name in ("recurrence", "recurrence_index", "reservation_expires_at"):
            if name in legacy.fields and name not in current.fields:
                state.add_field("rentals", "rentals", name, legacy.fields[name].clone(), True)
        existing = {constraint.name for constraint in current.options.get("constraints", [])}
        for constraint in legacy.options.get("constraints", []):
            if constraint.name not in existing:
                state.add_constraint("rentals", "rentals", constraint.clone())

        # Notifications/recurrence may have been installed before the app move.
        for (related_app, model_name), model in list(state.models.items()):
            if (related_app, model_name) == ("api", "rentals"):
                continue
            for name, field in list(model.fields.items()):
                relation = getattr(field, "remote_field", None)
                if relation and str(relation.model).lower() == "api.rentals":
                    field = field.clone()
                    field.remote_field.model = "rentals.rentals"
                    state.alter_field(related_app, model_name, name, field, True)
        super().state_forwards(app_label, state)
