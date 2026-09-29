package models

// User is the learner's local record. The id is the Cognito sub, so there is
// no separate identity table, and the user pool stays the only owner of the
// name, email and picture.
type User struct {
	BaseModel
}
