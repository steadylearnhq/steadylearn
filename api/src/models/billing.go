package models

import (
	"time"

	"github.com/google/uuid"
)

// Subscription is a member's Creem subscription, as Creem last reported it.
// Creem is the system of record; this row is what the API answers from. A
// member may have several over time, one per checkout they completed.
type Subscription struct {
	BaseModel
	UpdatedAt           time.Time `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP"`
	UserId              uuid.UUID `gorm:"type:uuid;not null;index"`
	User                User      `gorm:"constraint:OnDelete:CASCADE"`
	CreemSubscriptionId string    `gorm:"not null;uniqueIndex"`
	CreemCustomerId     string    `gorm:"not null"`
	CreemProductId      string    `gorm:"not null"`
	// Status is Creem's, stored as it comes. It has no CHECK constraint: a
	// status Creem adds later must not make storing it fail.
	Status           string `gorm:"not null"`
	CurrentPeriodEnd *time.Time
	CanceledAt       *time.Time
	// CreemUpdatedAt is when Creem last changed the subscription, so an older
	// snapshot that arrives late never overwrites a newer one.
	CreemUpdatedAt time.Time `gorm:"not null"`
}

// CreemWebhookEvent is a webhook delivery from Creem that was handled. It lets
// a repeated delivery be acknowledged without handling it again, and keeps
// what Creem sent.
type CreemWebhookEvent struct {
	// Id is Creem's event id, evt_….
	Id          string    `gorm:"primaryKey"`
	EventType   string    `gorm:"not null"`
	OccurredAt  time.Time `gorm:"not null"`
	ProcessedAt time.Time `gorm:"not null;default:CURRENT_TIMESTAMP"`
	Payload     string    `gorm:"type:jsonb;not null"`
}
