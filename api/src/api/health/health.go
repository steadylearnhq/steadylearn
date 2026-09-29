package health

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"steadylearn-api/src/core"
	"steadylearn-api/src/schemas"
)

// pingTimeout bounds the readiness probe so a hung dependency cannot hold the
// request open and stall the orchestrator's own health checking.
const pingTimeout = 2 * time.Second

func RegisterHealthRoutes(router *gin.Engine) {
	router.GET("/health", Health)
	router.GET("/health/live", Live)
	router.GET("/health/ready", Ready)
}

// Health handles the plain health check
// @Summary Health check
// @Description Reports that the process is serving requests. Checks no dependencies.
// @Tags health
// @Produce json
// @Success 200 {object} schemas.HealthSchema
// @Router /health [get]
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, schemas.HealthSchema{Status: "ok"})
}

// Live handles the liveness probe
// @Summary Liveness probe
// @Description Reports that the process is alive. Always 200 while the server is up, so a failure means the process should be restarted.
// @Tags health
// @Produce json
// @Success 200 {object} schemas.HealthSchema
// @Router /health/live [get]
func Live(c *gin.Context) {
	c.JSON(http.StatusOK, schemas.HealthSchema{Status: "ok"})
}

// Ready handles the readiness probe
// @Summary Readiness probe
// @Description Reports whether the service can serve traffic, verifying the database connection. Returns 503 when it is unavailable.
// @Tags health
// @Produce json
// @Success 200 {object} schemas.ReadinessSchema
// @Failure 503 {object} schemas.ReadinessSchema
// @Router /health/ready [get]
func Ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), pingTimeout)
	defer cancel()

	response := schemas.ReadinessSchema{Status: "ok", Database: "ok"}

	if err := core.PingDB(ctx); err != nil {
		message := err.Error()
		response.Status = "unavailable"
		response.Database = "unavailable"
		response.Error = &message
		c.JSON(http.StatusServiceUnavailable, response)
		return
	}

	c.JSON(http.StatusOK, response)
}
