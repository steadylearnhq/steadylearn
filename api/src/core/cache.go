package core

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/extra/redisotel/v9"
	"github.com/redis/go-redis/v9"
)

// Cache is the Redis the API keeps read-through copies in. Nothing in it is a
// system of record: every entry expires, and a caller that cannot reach it
// falls back to the source rather than failing.
var Cache *redis.Client

// cacheKeyPrefix namespaces every key the API writes. The Redis instance may be
// shared with other services, so a bare key could collide with theirs.
const cacheKeyPrefix = "steadylearn"

// cacheConnectTimeout bounds the boot-time ping, so an unreachable Redis fails
// the start rather than hanging it.
const cacheConnectTimeout = 5 * time.Second

// Per-operation timeouts. go-redis defaults to 5s to dial and 3s to read, which
// a stalled Redis would add to every cached request before it fell back to the
// source. A cache that slow is not saving anything, so it is given up on fast.
// A timeout set in REDIS_URL's query string still wins.
const (
	cacheDialTimeout = 1 * time.Second
	cacheIOTimeout   = 500 * time.Millisecond
)

func InitCache() error {
	opt, err := redis.ParseURL(Config.RedisUrl)
	if err != nil {
		return fmt.Errorf("failed to parse REDIS_URL: %w", err)
	}

	if opt.DialTimeout == 0 {
		opt.DialTimeout = cacheDialTimeout
	}
	if opt.ReadTimeout == 0 {
		opt.ReadTimeout = cacheIOTimeout
	}
	if opt.WriteTimeout == 0 {
		opt.WriteTimeout = cacheIOTimeout
	}

	Cache = redis.NewClient(opt)

	if err := redisotel.InstrumentTracing(Cache); err != nil {
		return fmt.Errorf("failed to instrument redis tracing: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), cacheConnectTimeout)
	defer cancel()

	if err := Cache.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to redis: %w", err)
	}

	return nil
}

// CloseCache releases the Redis connection pool.
func CloseCache() error {
	if Cache == nil {
		return errors.New("cache not initialized")
	}
	return Cache.Close()
}

// CacheKey joins the parts under the API's namespace: CacheKey("user", id) is
// "steadylearn:user:<id>".
func CacheKey(parts ...string) string {
	return cacheKeyPrefix + ":" + strings.Join(parts, ":")
}
