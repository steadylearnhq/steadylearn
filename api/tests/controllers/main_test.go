// Package controllers_test tests src/api/v1/controllers through Gin, against
// the package's own Postgres container.
package controllers_test

import (
	"os"
	"testing"

	"steadylearn-api/tests/testutil"
)

func TestMain(m *testing.M) {
	os.Exit(testutil.Run(m))
}
