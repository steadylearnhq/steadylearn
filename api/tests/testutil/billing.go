package testutil

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm/clause"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
)

// Subscribe gives the member an active subscription, setting them up first,
// so they may take every course. Call UseDB first.
func Subscribe(t *testing.T, userId uuid.UUID) {
	t.Helper()
	user := models.User{BaseModel: models.BaseModel{Id: userId}}
	require.NoError(t, core.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error)

	id := "sub_" + userId.String()
	periodEnd := time.Now().Add(30 * 24 * time.Hour)
	require.NoError(t, core.DB.Omit("User").Create(&models.Subscription{
		BaseModel:           models.BaseModel{Id: uuid.New()},
		UserId:              userId,
		CreemSubscriptionId: id,
		CreemCustomerId:     "cust_" + id,
		CreemProductId:      CreemProductId,
		Status:              "active",
		CurrentPeriodEnd:    &periodEnd,
		CreemUpdatedAt:      time.Now(),
	}).Error)
}
