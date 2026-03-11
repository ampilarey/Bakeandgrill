export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type Review = {
  id: number;
  rating: number;
  comment: string | null;
  type: 'order' | 'item';
  status: ReviewStatus;
  is_anonymous: boolean;
  author: string;
  item: { id: number; name: string } | null;
  order: { id: number; order_number: string } | null;
  created_at: string;
};

export type ItemReviewsResponse = {
  average_rating: number | null;
  review_count: number;
  reviews: Review[];
};
