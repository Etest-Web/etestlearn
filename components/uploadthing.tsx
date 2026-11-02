"use client";

import { generateUploadButton, generateReactHelpers } from "@uploadthing/react";
import type { UploadRouter } from "@/app/api/uploadthing/core";

export const LessonVideoUploadButton = generateUploadButton<UploadRouter>();

export const { useUploadThing, uploadFiles } = generateReactHelpers<UploadRouter>();
