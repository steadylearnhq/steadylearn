package services_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
)

// addStages stores a course with one lesson holding the stages.
func addStages(t *testing.T, stages ...models.LessonStage) error {
	t.Helper()
	useEmptyCatalog(t)
	domain := addDomain(t, "systems", 1)
	course := addCourse(t, domain, models.Course{Slug: "course", Modules: []models.CourseModule{{Position: 1, Title: "Module"}}})

	lesson := models.Lesson{BaseModel: base(), ModuleId: course.Modules[0].Id, Position: 1, Title: "Lesson", Minutes: 10}
	for i := range stages {
		stages[i].BaseModel = base()
		stages[i].Position = i + 1
	}
	lesson.Stages = stages
	return core.DB.Create(&lesson).Error
}

func TestLessonStageRoundTrip(t *testing.T) {
	require.NoError(t, addStages(t,
		models.LessonStage{Kind: models.StageLearn, Steps: models.StepList{models.StepWatch}},
		models.LessonStage{Kind: models.StageInteractive, Steps: models.StepList{models.StepTrace}, Content: `{"component": "placeholder"}`},
		models.LessonStage{Kind: models.StageLearn, Steps: models.StepList{models.StepWatch, models.StepRead}},
		models.LessonStage{Kind: models.StageQuestions, Steps: models.StepList{models.StepBet}},
		models.LessonStage{Kind: models.StageReview},
	))

	var stages []models.LessonStage
	require.NoError(t, core.DB.Order("position").Find(&stages).Error)
	require.Len(t, stages, 5)

	assert.Equal(t, []string{models.StageLearn, models.StageInteractive, models.StageLearn, models.StageQuestions, models.StageReview},
		[]string{stages[0].Kind, stages[1].Kind, stages[2].Kind, stages[3].Kind, stages[4].Kind}, "a kind can repeat")
	assert.Equal(t, models.StepList{models.StepWatch, models.StepRead}, stages[2].Steps)
	assert.Equal(t, models.StepList{}, stages[4].Steps, "no steps is stored as an empty array")
	assert.JSONEq(t, `{"component": "placeholder"}`, stages[1].Content)
	assert.JSONEq(t, `{}`, stages[0].Content, "content defaults to an empty object")
}

func TestLessonStageSteps(t *testing.T) {
	cases := []struct {
		name  string
		kind  string
		steps models.StepList
		ok    bool
	}{
		{"learn by watching", models.StageLearn, models.StepList{models.StepWatch}, true},
		{"learn by reading", models.StageLearn, models.StepList{models.StepRead}, true},
		{"learn either way", models.StageLearn, models.StepList{models.StepWatch, models.StepRead}, true},
		{"a lab", models.StageInteractive, models.StepList{models.StepRange}, true},
		{"questions", models.StageQuestions, models.StepList{models.StepBet}, true},
		{"a review", models.StageReview, nil, true},
		{"a postmortem", models.StageInteractive, models.StepList{models.StepPostmortem}, true},

		{"learn with nothing to learn from", models.StageLearn, nil, false},
		{"learn with a lab", models.StageLearn, models.StepList{models.StepBuild}, false},
		{"learn with a step twice", models.StageLearn, models.StepList{models.StepRead, models.StepRead}, false},
		{"a lab without one", models.StageInteractive, nil, false},
		{"two labs", models.StageInteractive, models.StepList{models.StepBuild, models.StepBreak}, false},
		{"questions with a lab", models.StageQuestions, models.StepList{models.StepTrace}, false},
		{"a review with a bet", models.StageReview, models.StepList{models.StepBet}, false},
		{"a review with a postmortem", models.StageReview, models.StepList{models.StepPostmortem}, false},
		{"a lab and its postmortem", models.StageInteractive, models.StepList{models.StepBreak, models.StepPostmortem}, false},
		{"an unknown step", models.StageReview, models.StepList{"nap"}, false},
		{"an unknown kind", "quiz", models.StepList{models.StepBet}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := addStages(t, models.LessonStage{Kind: c.kind, Steps: c.steps})
			if c.ok {
				assert.NoError(t, err)
			} else {
				assert.ErrorContains(t, err, "chk_lesson_stages_")
			}
		})
	}
}

func TestLessonStagePositionsAreUnique(t *testing.T) {
	require.NoError(t, addStages(t, models.LessonStage{Kind: models.StageReview}))

	var lesson models.Lesson
	require.NoError(t, core.DB.First(&lesson).Error)
	err := core.DB.Create(&models.LessonStage{BaseModel: base(), LessonId: lesson.Id, Position: 1, Kind: models.StageReview}).Error
	assert.ErrorContains(t, err, "idx_lesson_stages_lesson_position")
}
