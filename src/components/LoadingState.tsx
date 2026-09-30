export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card padded" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="loading-skeleton" style={{ marginBottom: '0.75rem' }} />
      ))}
    </div>
  )
}
