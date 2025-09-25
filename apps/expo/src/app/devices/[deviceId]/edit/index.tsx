import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  buttons,
  cards,
  containers,
  inputs,
  spacing,
  typography,
} from "~/styles";
import { trpc } from "~/utils/api";

export default function EditDevicePage() {
  const { deviceId } = useGlobalSearchParams<{ deviceId: string }>();
  const queryClient = useQueryClient();

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["device", "getById", { id: deviceId }],
    queryFn: async () => {
      return await trpc.device.getById.query({ id: deviceId });
    },
    enabled: !!deviceId,
  });

  const [title, setTitle] = useState(device?.title ?? "");
  const [description, setDescription] = useState(device?.description ?? "");
  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
  }>({});

  // Update form values when device data loads
  React.useEffect(() => {
    if (device) {
      setTitle(device.title ?? "");
      setDescription(device.description ?? "");
    }
  }, [device]);

  const updateMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string }) => {
      if (!device?.id) throw new Error("Device ID is missing");
      return await trpc.device.update.mutate({
        id: device.id,
        ...data,
      });
    },
    onSuccess: () => {
      // Invalidate device queries to refresh data
      if (device?.id) {
        void queryClient.invalidateQueries({
          queryKey: ["device", "getById", { id: device.id }],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      Alert.alert("Success", "Device updated successfully!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to update device: ${error.message}`);
    },
  });

  const validateForm = () => {
    const newErrors: { title?: string; description?: string } = {};

    if (!title.trim()) {
      newErrors.title = "Title is required";
    } else if (title.length < 2) {
      newErrors.title = "Title must be at least 2 characters";
    } else if (title.length > 50) {
      newErrors.title = "Title must be less than 50 characters";
    }

    if (description && description.length < 2) {
      newErrors.description = "Description must be at least 2 characters";
    } else if (description && description.length > 128) {
      newErrors.description = "Description must be less than 128 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    updateMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View style={containers.contentCentered}>
          <Text style={typography.body}>Loading device...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !device) {
    return (
      <SafeAreaView style={containers.safeArea}>
        <View style={containers.contentCentered}>
          <Text
            style={[
              typography.h6,
              { color: "#dc2626", marginBottom: spacing[4] },
            ]}
          >
            Failed to load device
          </Text>
          <Pressable
            style={[buttons.base, buttons.primary]}
            onPress={() => router.back()}
          >
            <Text style={[typography.labelLarge, { color: "#ffffff" }]}>
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containers.safeArea}>
      {/* Custom Header */}
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing[4],
            paddingVertical: spacing[3],
            borderBottomWidth: 1,
            borderBottomColor: "#e5e7eb",
          },
        ]}
      >
        <Pressable
          style={[{ position: "absolute", left: spacing[4], zIndex: 1 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </Pressable>
        <View style={[{ flex: 1, alignItems: "center" }]}>
          <Text style={[typography.h6]}>Edit Device</Text>
        </View>
      </View>

      <ScrollView
        style={containers.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingVertical: spacing[4] }}>
          {/* Device Name Field */}
          <View style={[containers.section]}>
            <Text style={[typography.labelLarge, { marginBottom: spacing[2] }]}>
              Device Name
            </Text>
            <TextInput
              style={[inputs.base, errors.title && { borderColor: "#ef4444" }]}
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                if (errors.title) {
                  setErrors((prev) => ({ ...prev, title: undefined }));
                }
              }}
              placeholder="Enter device name"
              maxLength={50}
              autoCapitalize="words"
              editable={!updateMutation.isPending}
            />
            {errors.title && (
              <Text
                style={[
                  typography.caption,
                  { color: "#ef4444", marginTop: spacing[1] },
                ]}
              >
                {errors.title}
              </Text>
            )}
            <Text
              style={[
                typography.caption,
                { color: "#9ca3af", textAlign: "right", marginTop: spacing[1] },
              ]}
            >
              {title.length}/50
            </Text>
          </View>

          {/* Description Field */}
          <View style={[containers.section]}>
            <Text style={[typography.labelLarge, { marginBottom: spacing[2] }]}>
              Description
            </Text>
            <TextInput
              style={[
                inputs.base,
                {
                  height: 80,
                  paddingTop: spacing[3],
                  textAlignVertical: "top",
                },
                errors.description && { borderColor: "#ef4444" },
              ]}
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                if (errors.description) {
                  setErrors((prev) => ({ ...prev, description: undefined }));
                }
              }}
              placeholder="Enter device description (optional)"
              maxLength={128}
              multiline
              numberOfLines={3}
              editable={!updateMutation.isPending}
            />
            {errors.description && (
              <Text
                style={[
                  typography.caption,
                  { color: "#ef4444", marginTop: spacing[1] },
                ]}
              >
                {errors.description}
              </Text>
            )}
            <Text
              style={[
                typography.caption,
                { color: "#9ca3af", textAlign: "right", marginTop: spacing[1] },
              ]}
            >
              {description.length}/128
            </Text>
          </View>

          {/* Device Info */}
          <View style={[cards.base, { marginTop: spacing[4] }]}>
            <Text style={[typography.h6, { marginBottom: spacing[3] }]}>
              Device Information
            </Text>
            <View
              style={[
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: spacing[2],
                  borderBottomWidth: 1,
                  borderBottomColor: "#f3f4f6",
                },
              ]}
            >
              <Text style={[typography.body, { color: "#6b7280" }]}>
                Serial Number:
              </Text>
              <Text style={[typography.labelLarge]}>
                {device.serialNumber ?? "Not available"}
              </Text>
            </View>
            <View
              style={[
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: spacing[2],
                },
              ]}
            >
              <Text style={[typography.body, { color: "#6b7280" }]}>
                Created:
              </Text>
              <Text style={[typography.labelLarge]}>
                {device.createdAt
                  ? new Date(device.createdAt).toLocaleString()
                  : "Unknown"}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Save Button at Bottom */}
      <View
        style={[
          {
            paddingHorizontal: spacing[4],
            paddingVertical: spacing[3],
            borderTopWidth: 1,
            borderTopColor: "#e5e7eb",
            backgroundColor: "#ffffff",
          },
        ]}
      >
        <Pressable
          style={[
            buttons.base,
            buttons.primary,
            updateMutation.isPending && { backgroundColor: "#9ca3af" },
          ]}
          onPress={handleSave}
          disabled={updateMutation.isPending}
        >
          <Text style={[typography.labelLarge, { color: "#ffffff" }]}>
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
