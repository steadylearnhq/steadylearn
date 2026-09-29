package models

import (
	"time"

	"github.com/google/uuid"
)

type BaseModel struct {
	Id        uuid.UUID  `gorm:"primaryKey;type:uuid" json:"id"`
	CreatedAt time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"createdAt,omitempty"`
	DeletedAt *time.Time `gorm:"column:deleted_at;" json:"-"`
}
