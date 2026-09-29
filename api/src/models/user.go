package models

// User is the learner's local record. The id is the Cognito sub, so there is
// no separate identity table.
type User struct {
	BaseModel
	Name       string  `gorm:"column:name;type:varchar(255);not null" json:"name"`
	PictureUrl *string `gorm:"column:picture_url;type:varchar(255)" json:"pictureUrl"`
}
