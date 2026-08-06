export function Spinner() {
  return (
    <div className="flex justify-center py-12" role="status" aria-label="Loading">
      <div className="size-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
    </div>
  );
}
