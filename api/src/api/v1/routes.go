package routes

import (
	"github.com/gin-gonic/gin"

	"steadylearn-api/src/api/v1/controllers"
	"steadylearn-api/src/middleware"
)

func RegisterV1Routes(router *gin.Engine) {
	v1 := router.Group("/v1")
	{
		userRoutes := v1.Group("/users")
		{
			userRoutes.GET("/me", middleware.RequireAuth(), controllers.GetCurrentUser)
			userRoutes.PUT("/me", middleware.RequireAuth(), controllers.UpdateCurrentUser)
			userRoutes.POST("", middleware.RequireAuth(), controllers.SetupUser)
		}
	}
}
