import { eventItems } from '../data/mockItems';
import { ItemCard } from '../components/ItemCard';

export function EventPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Event Specials</h1>
      {/* 5 items per row (same as event page) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {eventItems.map((item) => (
          <ItemCard key={item.id} item={item} showQuantityControls />
        ))}
      </div>
    </div>
  );
}
