#!/usr/bin/env node
/**
 * Post-install fixup for a real bug in the published @expo/ui@57.0.6 npm
 * package: its package.json "exports" map points "./jetpack-compose" and
 * "./swift-ui" at "./src/jetpack-compose" and "./src/swift-ui", but the
 * published tarball only ships "./src/community" — those two directories
 * simply aren't in the package on npm. expo-router's Android/iOS
 * Stack.Toolbar support imports "@expo/ui/jetpack-compose" unconditionally
 * (even if the app never renders a Stack.Toolbar), so without this fix
 * Metro fails to resolve the module and bundling for Android/iOS breaks
 * for every app using a recent expo-router version, regardless of whether
 * this project uses that feature.
 *
 * This writes minimal React Native stand-ins (not real Jetpack
 * Compose/SwiftUI bindings) so the module resolves and bundling succeeds.
 * Safe to re-run; it only writes files, never deletes/modifies anything
 * else in node_modules. Runs automatically via the root "postinstall"
 * script so the fix survives a fresh `npm install` (e.g. on Render, EAS
 * Build, or a teammate's machine) without needing a fragile patch-package
 * diff (attempted first; patch-package's temp reference install didn't
 * match this monorepo's hoisted node_modules layout closely enough and
 * produced a bogus 60k+ line patch, so a plain idempotent write is used
 * instead).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', '@expo', 'ui', 'src');

const indexTs = `// Stub shim: see scripts/fix-expo-ui-stub.js for why this file exists.
import React from 'react';
import { View, Pressable, Text as RNText, Image } from 'react-native';

function passthrough(Component) {
  return React.forwardRef((props, ref) => React.createElement(Component, { ref, ...props }, props.children));
}

export const Box = passthrough(View);
export const Row = passthrough(View);
export const Host = passthrough(View);
export const RNHostView = passthrough(View);
export const HorizontalDivider = passthrough(View);
export const Badge = passthrough(View);
export const Text = passthrough(RNText);
export const IconButton = React.forwardRef((props, ref) =>
  React.createElement(Pressable, { ref, onPress: props.onClick, disabled: !props.enabled }, props.children)
);
export const Icon = (props) =>
  props.source
    ? React.createElement(Image, {
        source: props.source,
        style: { width: props.size ?? 24, height: props.size ?? 24, tintColor: props.tint ?? undefined },
      })
    : null;

function withStatics(Base, statics) {
  return Object.assign(Base, statics);
}

export const DropdownMenuItem = withStatics(passthrough(Pressable), {
  Text: passthrough(RNText),
  LeadingIcon: passthrough(View),
  TrailingIcon: passthrough(View),
});

export const DropdownMenu = withStatics(passthrough(View), {
  Trigger: passthrough(View),
  Items: passthrough(View),
});
`;

const modifiersTs = `// Stub shim: see scripts/fix-expo-ui-stub.js for why this file exists.
// The stub components above ignore the "modifiers" prop entirely, so these
// just need to exist and be callable — no real layout behavior required.
function makeModifier(name, ...args) {
  return { __stubModifier: true, name, args };
}
export const width = (...args) => makeModifier('width', ...args);
export const fillMaxHeight = (...args) => makeModifier('fillMaxHeight', ...args);
export const alpha = (...args) => makeModifier('alpha', ...args);
export const background = (...args) => makeModifier('background', ...args);
`;

for (const dir of ['jetpack-compose', 'swift-ui']) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) {
    fs.mkdirSync(path.join(base, 'modifiers'), { recursive: true });
    fs.writeFileSync(path.join(base, 'index.ts'), indexTs);
    fs.writeFileSync(path.join(base, 'modifiers', 'index.ts'), modifiersTs);
    console.log(`[fix-expo-ui-stub] wrote stub for @expo/ui/${dir}`);
  }
}
