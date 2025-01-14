#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (all(greaterThanEqual(sampling_position, vec3(0.0)))
    && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;

}

vec3 get_gradient(vec3 s) {
    float distance = length(max_bounds / volume_dimensions);
    vec3 gradient;
    gradient.x = (get_sample_data(vec3(s.x + distance, s.y, s.z)) - get_sample_data(vec3(s.x - distance, s.y, s.z))) / 2;
    gradient.y = (get_sample_data(vec3(s.x, s.y + distance, s.z)) - get_sample_data(vec3(s.x, s.y - distance, s.z))) / 2;
    gradient.z = (get_sample_data(vec3(s.x, s.y, s.z + distance)) - get_sample_data(vec3(s.x, s.y, s.z - distance))) / 2;
    return gradient;
}

vec4 phong(vec3 sampling_pos) {
    vec3 second = sampling_pos;

    vec3 N = normalize(get_gradient(sampling_pos));
    vec3 L = normalize(light_position - sampling_pos);

    // Lambert's cosine law
    float lambertian = max(dot(N, L), 0.0);
    float specular = 0.0;
    if (lambertian > 0.0) {
        vec3 R = reflect(-L, N);// Reflected light vector
        vec3 V = normalize(-sampling_pos);// Vector to viewer
        // Compute the specular term
        float specAngle = max(dot(R, V), 0.0);
        specular = pow(specAngle, light_ref_coef);
    }
    return vec4(1 * light_ambient_color +
    1 * lambertian * light_diffuse_color +
    1 * specular * light_specular_color, 1.0);
}

void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment;// test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);

    if (!inside_volume)
    discard;

    #if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);

    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
        float s = get_sample_data(sampling_pos);

        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));

        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);

        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
    #endif

    #if TASK == 11
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    float s_sum_r;
    float s_sum_g;
    float s_sum_b;
    float s_sum_a;
    float total;
    
    while (inside_volume)
    {
        // get sample
        float s = get_sample_data(sampling_pos);

         // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));


        s_sum_r += color.r;
        s_sum_g += color.g;
        s_sum_b += color.b;
        s_sum_a += color.a;
        total += 1;
                
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    float average_r = s_sum_r / total;
    float average_g = s_sum_g / total;
    float average_b = s_sum_b / total;
    float average_a = s_sum_a / total;
    
    dst = vec4(average_r, average_g, average_b, average_a);

        #endif

        #if TASK == 12 || TASK == 13
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
        float s = get_sample_data(sampling_pos);

        if (s > iso_value) {
            dst = texture(transfer_texture, vec2(s, s));
            //            dst = vec4(vec3(s), 1.0);

            #if TASK == 13// Binary Search

            vec3 left = sampling_pos - ray_increment;
            vec3 right = sampling_pos;

            for (int i = 0; i < 64; i++) {
                vec3 center = (left + right) * 0.5;
                s = get_sample_data(center);

                if (s == iso_value) {
                    break;
                } else if (s < iso_value) {
                    right = center;
                } else {
                    left = center;
                }
            }

            dst = texture(transfer_texture, vec2(s, s));
            //            dst = vec4(vec3(s), 1.0);

            #endif
            #if ENABLE_LIGHTNING == 1// Add Shading
            dst = phong(sampling_pos);
            #if ENABLE_SHADOWING == 1// Add Shadows
            vec3 shadowing_ray_step = normalize(sampling_pos - light_position) * sampling_distance;
            vec3 shadowing_sampling_pos = sampling_pos + shadowing_ray_step;
            bool shadowing_inside_volume = true;
            bool isBlack = false;
            while (shadowing_inside_volume) {
                // get sample
                float next_s = get_sample_data(shadowing_sampling_pos);

                if (next_s >= s) {
                    isBlack = true;
                    break;
                }

                // increment the ray sampling position
                shadowing_sampling_pos  += shadowing_ray_step;

                // update the loop termination condition
                shadowing_inside_volume  = inside_volume_bounds(shadowing_sampling_pos);
            }

            if (isBlack) {
                dst = vec4(0,0,0,0);
                break;
            }

                #endif
                #endif

            break;
        }

        // increment the ray sampling position
        sampling_pos += ray_increment;

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
        #endif

        #if TASK == 31
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
        #if ENABLE_OPACITY_CORRECTION == 1// Opacity Correction
        IMPLEMENT;
        #else
        float s = get_sample_data(sampling_pos);
        #endif
        // dummy code
        dst = vec4(light_specular_color, 1.0);

        // increment the ray sampling position
        sampling_pos += ray_increment;

        #if ENABLE_LIGHTNING == 1// Add Shading
        IMPLEMENT;
        #endif

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
        #endif

    // return the calculated color value
    FragColor = dst;
}

