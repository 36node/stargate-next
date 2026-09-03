variable "STARGATE_NEXT_TAGS" {
  default = ""
}

variable "PLAYGROUND_TAGS" {
  default = ""
}

variable "DB_TAGS" {
  default = ""
}

group "default" {
  targets = ["stargate-next", "playground", "db"]
}

target "stargate-next" {
  context    = "apps/stargate-next"
  dockerfile = "Dockerfile"
  tags       = STARGATE_NEXT_TAGS != "" ? split("\n", trimspace(STARGATE_NEXT_TAGS)) : []
}

target "playground" {
  context    = "apps/playground"
  dockerfile = "Dockerfile"
  tags       = PLAYGROUND_TAGS != "" ? split("\n", trimspace(PLAYGROUND_TAGS)) : []
}

target "db" {
  context    = "."
  dockerfile = "packages/db/Dockerfile"
  tags       = DB_TAGS != "" ? split("\n", trimspace(DB_TAGS)) : []
}
