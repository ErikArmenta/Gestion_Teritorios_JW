export default function Pagination({ currentPage, totalItems, itemsPerPage, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  function getPageNumbers() {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    // Always show first 2
    pages.push(1, 2);

    // Show ellipsis or pages around current
    if (currentPage > 4) {
      pages.push('...');
    }

    // Pages adjacent to current
    const rangeStart = Math.max(3, currentPage - 1);
    const rangeEnd = Math.min(totalPages - 2, currentPage + 1);

    for (let i = rangeStart; i <= rangeEnd; i++) {
      if (!pages.includes(i)) pages.push(i);
    }

    if (currentPage < totalPages - 3) {
      pages.push('...');
    }

    // Always show last 2
    if (!pages.includes(totalPages - 1)) pages.push(totalPages - 1);
    if (!pages.includes(totalPages)) pages.push(totalPages);

    return pages;
  }

  const btnBase = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.5rem',
    padding: '0.375rem 0.75rem',
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    cursor: 'pointer',
    border: '1px solid rgba(0,0,0,0.1)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    transition: 'all 0.15s',
  };

  const btnActive = {
    ...btnBase,
    background: '#2563EB',
    color: '#fff',
    border: '1px solid #2563EB',
  };

  const btnDisabled = {
    ...btnBase,
    opacity: 0.4,
    cursor: 'not-allowed',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        Mostrando {startItem}–{endItem} de {totalItems} elementos
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={currentPage === 1 ? btnDisabled : btnBase}
        >
          ← Anterior
        </button>

        {getPageNumbers().map((page, idx) =>
          page === '...' ? (
            <span
              key={`ellipsis-${idx}`}
              style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              style={page === currentPage ? btnActive : btnBase}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={currentPage === totalPages ? btnDisabled : btnBase}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
