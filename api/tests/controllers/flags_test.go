package controllers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"steadylearn-api/src/api/v1/controllers"
	"steadylearn-api/src/core"
)

func TestFlagUser(t *testing.T) {
	userId := uuid.New()
	cases := []struct {
		name     string
		userId   uuid.UUID // uuid.Nil for a visitor
		stableID string
		want     core.FlagUser
	}{
		{name: "visitor with consent", stableID: " stable-1 ", want: core.FlagUser{StableID: "stable-1"}},
		{name: "visitor without consent", want: core.FlagUser{}},
		{name: "member with consent", userId: userId, stableID: "stable-1", want: core.FlagUser{UserID: userId.String(), StableID: "stable-1"}},
		{name: "member without consent", userId: userId, want: core.FlagUser{UserID: userId.String()}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
			c.Request.RemoteAddr = "203.0.113.7:1234"
			c.Request.Header.Set("User-Agent", "test-agent")
			if tc.stableID != "" {
				c.Request.Header.Set(controllers.StableIDHeader, tc.stableID)
			}
			if tc.userId != uuid.Nil {
				c.Set("user_id", tc.userId)
			}

			got := controllers.FlagUser(c)

			tc.want.IP = "203.0.113.7"
			tc.want.UserAgent = "test-agent"
			assert.Equal(t, tc.want, got)
		})
	}
}
