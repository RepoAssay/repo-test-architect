plugins {
    kotlin("multiplatform") version "2.2.20"
}

repositories {
    mavenCentral()
}

kotlin {
    jvm("desktop")
    js()

    sourceSets {
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
