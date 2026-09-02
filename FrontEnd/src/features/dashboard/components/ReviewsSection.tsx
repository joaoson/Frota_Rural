import { toast } from "sonner";

import DashboardPagination from "@/components/DashboardPagination";
import MaterialIcon from "@/components/MaterialIcon";
import { useDeleteReview } from "@/features/reviews/hooks/useReviews";
import type { Review } from "@/features/reviews/types/review";
import { PageHeader } from "@/shared/components/PageHeader";
import { StarRating } from "@/shared/components/StarRating";

/**
 * Aba de avaliações dos dois dashboards.
 *
 * As duas cópias eram idênticas a menos de espaço em branco e do `?:` vs `&&`
 * que envolvia o bloco.
 */
function ReviewCard({
  name,
  date,
  rating,
  comment,
  avatarClassName,
  action,
}: {
  name: string | null | undefined;
  date: Date | null | undefined;
  rating: number;
  comment: string | null | undefined;
  avatarClassName: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 hover:shadow-md transition-shadow shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold ${avatarClassName}`}
          >
            {name?.slice(0, 2).toUpperCase() || "NA"}
          </div>
          <div>
            <div className="font-bold text-on-surface text-sm">{name}</div>
            <div className="text-xs text-on-surface-variant">
              {date?.toLocaleDateString("pt-BR") ?? ""}
            </div>
          </div>
        </div>
        {action ? (
          <div className="flex items-center gap-2">
            <StarRating value={rating} />
            {action}
          </div>
        ) : (
          <StarRating value={rating} />
        )}
      </div>
      <p className="text-sm text-on-surface leading-relaxed">"{comment}"</p>
    </div>
  );
}

interface ReviewsSectionProps {
  receivedReviews: Review[];
  givenReviews: Review[];
}

export function ReviewsSection({ receivedReviews, givenReviews }: ReviewsSectionProps) {
  const deleteReview = useDeleteReview();

  return (
    <div className="space-y-8">
      <PageHeader title="Avaliações" subtitle="Veja as avaliações recebidas e fornecidas" compact />

      <div>
        <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
          <MaterialIcon icon="inbox" size={22} className="text-primary" /> Avaliações Recebidas
        </h2>
        <div className="space-y-4">
          {receivedReviews.length > 0 ? (
            receivedReviews.map((review) => (
              <ReviewCard
                key={review.id}
                name={review.reviewerName}
                date={review.createdAt}
                rating={review.rating}
                comment={review.comment}
                avatarClassName="bg-secondary-container/30 text-tertiary"
              />
            ))
          ) : (
            <p className="text-sm text-on-surface-variant">Nenhuma avaliação recebida ainda.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="font-headline text-xl font-bold text-tertiary mb-4 flex items-center gap-2">
          <MaterialIcon icon="outbox" size={22} className="text-primary" /> Avaliações Fornecidas
        </h2>
        <div className="space-y-4">
          {givenReviews.length > 0 ? (
            givenReviews.map((review) => (
              <ReviewCard
                key={review.id}
                name={review.revieweeName}
                date={review.createdAt}
                rating={review.rating}
                comment={review.comment}
                avatarClassName="bg-primary/10 text-primary"
                action={
                  <button
                    onClick={() => {
                      deleteReview
                        .mutateAsync(review.id)
                        .then(() => toast.success("Avaliação excluída com sucesso."))
                        .catch(() => toast.error("Erro ao excluir avaliação."));
                    }}
                    className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors"
                    title="Excluir avaliação"
                  >
                    <MaterialIcon icon="close" size={16} />
                  </button>
                }
              />
            ))
          ) : (
            <p className="text-sm text-on-surface-variant">
              Você ainda não forneceu nenhuma avaliação.
            </p>
          )}
        </div>
      </div>

      {(receivedReviews.length > 0 || givenReviews.length > 0) && (
        <DashboardPagination
          currentPage={1}
          totalPages={Math.max(
            1,
            Math.ceil(Math.max(receivedReviews.length, givenReviews.length) / 5),
          )}
          onPageChange={() => {}}
        />
      )}
    </div>
  );
}
