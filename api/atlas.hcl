data "external_schema" "gorm" {
  program = [
    "go",
    "run",
    "-mod=mod",
    "./cmd/atlas-loader",
  ]
}

variable "DATABASE_URL" {
  type = string
}

env "dev" {
  src = data.external_schema.gorm.url
  url = var.DATABASE_URL
  dev = "docker://postgres/16/dev?search_path=public"

  migration {
    dir = "file://migrations"
  }
}
