package services

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"

	"steadylearn-api/src/core"
)

// cached reads the value at key through the cache: a hit is answered without
// calling load, and a miss calls it and stores what it returns for ttl.
//
// The cache is an optimisation, never a dependency. When Redis cannot be read
// or written the error is logged and the value is served from load. Errors
// are not cached, so a failed load is tried again on the next request.
func cached[T any](ctx context.Context, key string, ttl time.Duration, load func() (T, error)) (T, error) {
	if value, ok := readCached[T](ctx, key); ok {
		return value, nil
	}

	value, err := load()
	if err != nil {
		return value, err
	}

	writeCached(ctx, key, value, ttl)

	return value, nil
}

// readCached reports a miss for an absent key, an unreachable cache and an
// entry that does not decode alike: each is answered from the source.
func readCached[T any](ctx context.Context, key string) (T, bool) {
	var value T

	raw, err := core.Cache.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return value, false
	}
	if err != nil {
		slog.WarnContext(ctx, "cache read failed", "key", key, "error", err)
		return value, false
	}

	if err := json.Unmarshal(raw, &value); err != nil {
		slog.WarnContext(ctx, "cached value did not decode", "key", key, "error", err)
		return value, false
	}

	return value, true
}

func writeCached(ctx context.Context, key string, value any, ttl time.Duration) {
	raw, err := json.Marshal(value)
	if err != nil {
		slog.WarnContext(ctx, "failed to encode value for the cache", "key", key, "error", err)
		return
	}

	if err := core.Cache.Set(ctx, key, raw, ttl).Err(); err != nil {
		slog.WarnContext(ctx, "cache write failed", "key", key, "error", err)
	}
}
