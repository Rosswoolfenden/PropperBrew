/** Five stars, filled to the nearest whole star. */
export function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= filled ? undefined : "off"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

export function Rating({ value, count }: { value: number; count: number }) {
  return (
    <span className="rating">
      <Stars value={value} />
      <span className="rating-count">
        {value.toFixed(1)} ({count} {count === 1 ? "review" : "reviews"})
      </span>
    </span>
  );
}
