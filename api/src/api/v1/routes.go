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
			userRoutes.POST("", middleware.RequireAuth(), controllers.SetupUser)
		}

		// The catalog is public: it is what visitors browse before signing up.
		// A signed-in caller also gets their own enrollments, and sees more of a
		// course, every lesson of its syllabus.
		v1.GET("/catalog", middleware.OptionalAuth(), controllers.GetCatalog)
		v1.GET("/courses/:id", middleware.OptionalAuth(), controllers.GetCourse)

		// Enrollments are the caller's own.
		v1.PUT("/courses/:id/enrollment", middleware.RequireAuth(), controllers.Enroll)
		v1.DELETE("/courses/:id/enrollment", middleware.RequireAuth(), controllers.Unenroll)
		v1.PUT("/courses/:id/lessons/:code/completion", middleware.RequireAuth(), controllers.CompleteLesson)
		v1.DELETE("/courses/:id/lessons/:code/completion", middleware.RequireAuth(), controllers.UncompleteLesson)
	}
}
