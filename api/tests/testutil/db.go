// Package testutil is the harness the test packages under tests/ share: a
// throwaway Postgres with the production schema, and mocks that stand in for
// the third-party services behind core's interface globals.
package testutil

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"gorm.io/gorm"

	"steadylearn-api/src/core"
)

// postgresImage matches docker-compose.yml and the Atlas dev database.
const postgresImage = "postgres:16-alpine"

var (
	dbOnce      sync.Once
	dbErr       error
	dbContainer *postgres.PostgresContainer
	dbRoot      *gorm.DB
)

// Run is what TestMain calls in a package that uses the database: it runs the
// package's tests, then stops the Postgres container UseDB started, if any.
// Each test package is its own binary, so each one that touches the database
// starts its own container.
func Run(m *testing.M) int {
	code := m.Run()

	if dbContainer != nil {
		if err := testcontainers.TerminateContainer(dbContainer); err != nil {
			fmt.Fprintf(os.Stderr, "failed to terminate postgres container: %v\n", err)
		}
	}

	return code
}

// migrationFiles lists api/migrations relative to this source file, so the
// harness finds them from a test package at any depth.
func migrationFiles() ([]string, error) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return nil, errors.New("cannot locate the migrations directory")
	}

	// Glob returns names in lexical order, and Atlas prefixes each migration
	// with its timestamp, so this is the order they were written in.
	migrations, err := filepath.Glob(filepath.Join(filepath.Dir(file), "..", "..", "migrations", "*.sql"))
	if err != nil {
		return nil, err
	}
	if len(migrations) == 0 {
		return nil, errors.New("no migrations found next to tests/")
	}

	return migrations, nil
}

// startDB runs a throwaway Postgres with every migration applied, and points
// core.DB at it. The connection comes from the container alone: .env points
// at a real database, and a test must never reach it.
func startDB() error {
	ctx := context.Background()

	migrations, err := migrationFiles()
	if err != nil {
		return err
	}

	dbContainer, err = postgres.Run(ctx, postgresImage,
		postgres.WithOrderedInitScripts(migrations...),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		return fmt.Errorf("failed to start postgres (is Docker running?): %w", err)
	}

	core.Config.DatabaseUrl, err = dbContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return err
	}
	if err := core.InitDB(); err != nil {
		return err
	}

	dbRoot = core.DB
	return nil
}

// UseDB gives the test the package's database, inside a transaction that is
// rolled back when the test ends, so nothing a test writes is seen by the
// next one. The container starts on the first call, so a package whose tests
// never ask for the database does not need Docker.
func UseDB(t *testing.T) {
	t.Helper()

	dbOnce.Do(func() { dbErr = startDB() })
	require.NoError(t, dbErr)

	tx := dbRoot.Begin()
	require.NoError(t, tx.Error)

	core.DB = tx
	t.Cleanup(func() {
		tx.Rollback()
		core.DB = dbRoot
	})
}
