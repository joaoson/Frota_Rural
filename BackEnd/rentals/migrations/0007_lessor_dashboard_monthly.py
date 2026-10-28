from django.db import migrations, models

# Rotina armazenada do painel do locador: a série mensal é agrupada no PostgreSQL
# (GROUP BY + generate_series), no fuso de quem consulta, e os meses sem movimento
# voltam com zero. Os status concluídos espelham `rentals.lifecycle.FINISHED`.
LESSOR_DASHBOARD_UP = """
CREATE OR REPLACE FUNCTION lessor_dashboard_monthly(
    p_owner uuid,
    p_months integer,
    p_time_zone text,
    p_now timestamptz,
    p_machine uuid DEFAULT NULL
)
RETURNS TABLE (
    month date,
    revenue numeric,
    completed_rentals bigint,
    rating_sum bigint,
    reviews bigint,
    average_rating numeric
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
DECLARE
    first_month date;
BEGIN
    IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
        RAISE EXCEPTION 'p_months deve estar entre 1 e 24 (recebido: %)', p_months
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    first_month := (date_trunc('month', p_now AT TIME ZONE p_time_zone)
                    - make_interval(months => p_months - 1))::date;

    RETURN QUERY
    WITH series AS (
        SELECT generate_series(
            first_month::timestamp,
            (first_month + make_interval(months => p_months - 1))::timestamp,
            interval '1 month'
        )::date AS month
    ),
    revenue_by_month AS (
        SELECT date_trunc('month', r.end_date AT TIME ZONE p_time_zone)::date AS month,
               SUM(COALESCE(r.total_price, 0)) AS revenue,
               COUNT(*) AS completed_rentals
        FROM rentals r
        JOIN postings p ON p.id = r.postings_id
        JOIN machines m ON m.id = p.machinery_id
        WHERE m.owner_id = p_owner
          AND (p_machine IS NULL OR m.id = p_machine)
          AND r.status IN ('completed', 'closed')
          AND r.end_date <= p_now
          AND r.end_date AT TIME ZONE p_time_zone >= first_month
        GROUP BY 1
    ),
    ratings_by_month AS (
        SELECT date_trunc('month', rv.created_at AT TIME ZONE p_time_zone)::date AS month,
               SUM(rv.rating) AS rating_sum,
               COUNT(*) AS reviews
        FROM reviews rv
        JOIN rentals r ON r.id = rv.rental_id
        JOIN postings p ON p.id = r.postings_id
        WHERE rv.reviewee_id = p_owner
          AND (p_machine IS NULL OR p.machinery_id = p_machine)
          AND rv.created_at <= p_now
          AND rv.created_at AT TIME ZONE p_time_zone >= first_month
        GROUP BY 1
    )
    SELECT s.month,
           COALESCE(rb.revenue, 0)::numeric(14, 2),
           COALESCE(rb.completed_rentals, 0)::bigint,
           COALESCE(rt.rating_sum, 0)::bigint,
           COALESCE(rt.reviews, 0)::bigint,
           ROUND(rt.rating_sum::numeric / NULLIF(rt.reviews, 0), 2)
    FROM series s
    LEFT JOIN revenue_by_month rb ON rb.month = s.month
    LEFT JOIN ratings_by_month rt ON rt.month = s.month
    ORDER BY s.month;
END;
$$;
"""

LESSOR_DASHBOARD_DOWN = """
DROP FUNCTION IF EXISTS lessor_dashboard_monthly(uuid, integer, text, timestamptz, uuid);
"""


class Migration(migrations.Migration):

    dependencies = [
        ('rentals', '0006_rentals_cancellation_policy_version_and_more'),
        ('reviews', '0001_initial'),
        ('machines', '0003_merge_machine_histories'),
        ('postings', '0005_alter_postings_status'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='rentals',
            index=models.Index(
                condition=models.Q(('status__in', ['completed', 'closed'])),
                fields=['end_date'],
                name='rentals_finished_end_idx',
            ),
        ),
        migrations.RunSQL(LESSOR_DASHBOARD_UP, reverse_sql=LESSOR_DASHBOARD_DOWN),
    ]
