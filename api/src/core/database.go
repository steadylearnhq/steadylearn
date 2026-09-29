package core

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/uptrace/opentelemetry-go-extra/otelgorm"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Connection pool limits. GORM's postgres driver runs pgx through database/sql,
// whose defaults (unbounded open connections, only 2 idle) would reopen a
// connection per request under any real concurrency.
const (
	maxOpenConns    = 80
	maxIdleConns    = 20
	connMaxLifetime = 30 * time.Minute
	connMaxIdleTime = 4 * time.Minute
)

func InitDB() error {
	var err error
	DB, err = gorm.Open(postgres.Open(Config.DatabaseUrl), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql handle: %w", err)
	}

	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxLifetime(connMaxLifetime)
	sqlDB.SetConnMaxIdleTime(connMaxIdleTime)

	// WithoutQueryVariables keeps bound parameter values (account/transaction
	// amounts, etc.) out of span attributes.
	if err := DB.Use(otelgorm.NewPlugin(otelgorm.WithoutQueryVariables())); err != nil {
		return fmt.Errorf("failed to attach otelgorm plugin: %w", err)
	}

	return nil
}

// PingDB verifies the database connection is usable. It is the readiness
// probe's only dependency check.
func PingDB(ctx context.Context) error {
	if DB == nil {
		return errors.New("database not initialized")
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql handle: %w", err)
	}

	if err := sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	return nil
}
