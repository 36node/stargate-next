variable "STARGATE_NEXT_TAGS" {
  default = ""
}

variable "PLAYGROUND_TAGS" {
  default = ""
}

group "default" {
  targets = ["stargate-next", "playground"]
}

target "stargate-next" {
  context    = "."
  dockerfile = "apps/stargate-next/Dockerfile"
  tags       = STARGATE_NEXT_TAGS != "" ? split("\n", trimspace(STARGATE_NEXT_TAGS)) : []
}

target "playground" {
  context    = "."
  dockerfile = "apps/playground/Dockerfile"
  tags       = PLAYGROUND_TAGS != "" ? split("\n", trimspace(PLAYGROUND_TAGS)) : []
}
